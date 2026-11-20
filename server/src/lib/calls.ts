import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { chatMembers, membership, postMessage, stamp } from "./chat";
import type { Call, CallSignal } from "./types";
import { pushCall, pushCallEnded } from "./push";

// Built-in voice and video calls, WhatsApp style. Phones connect directly
// (WebRTC); this server only rings people and passes the connection details
// ("signals") between them. Group calls are a mesh of up to MAX_PEOPLE.

export const RING_SECONDS = 45;
export const PRESENCE_TIMEOUT_SECONDS = 25;
export const MAX_PEOPLE = 6;

export function iceServers(): RTCIceServerLike[] {
  const servers: RTCIceServerLike[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (turn?.length) servers.push({ urls: turn, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return servers;
}
export interface RTCIceServerLike { urls: string[]; username?: string; credential?: string }

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

/** Close a call and leave a WhatsApp-style line in the chat. */
async function endCall(call: Call, reason: Call["end_reason"]): Promise<Call> {
  if (call.state === "ended") return call;
  const at = stamp();
  const ended = await getStore().update("calls", call.id, { state: "ended", ended_at: at, end_reason: reason, participants: [] });
  pushCallEnded(call.invited, call.id); // stop any phone still ringing
  const label = call.kind === "video" ? "video call" : "voice call";
  const icon = call.kind === "video" ? "📹" : "📞";
  const text = call.connected_at
    ? `${icon} ${label[0].toUpperCase()}${label.slice(1)} · ${duration(Date.parse(at) - Date.parse(call.connected_at))}`
    : reason === "declined" ? `${icon} ${label[0].toUpperCase()}${label.slice(1)} · declined` : `${icon} Missed ${label}`;
  await postMessage(call.chat_id, call.started_by, "call", text, { call_id: call.id });
  return ended;
}

/** Expire calls nobody answered and drop people whose phones stopped checking in. */
async function tidy(call: Call): Promise<Call> {
  if (call.state === "ended") return call;
  const now = Date.now();
  if (call.state === "ringing" && now - Date.parse(call.created_at) > RING_SECONDS * 1000) {
    return endCall(call, "no_answer");
  }
  const alive = call.participants.filter((p) => {
    const seen = call.presence[p];
    return seen && now - Date.parse(seen) < PRESENCE_TIMEOUT_SECONDS * 1000;
  });
  if (alive.length !== call.participants.length) {
    call = await getStore().update("calls", call.id, { participants: alive });
    if (call.state === "active" && alive.length < 2) return endCall(call, "ended");
    if (call.state === "ringing" && alive.length === 0) return endCall(call, "cancelled");
  }
  return call;
}

async function requireCall(callId: string, personId: string): Promise<Call> {
  const call = await getStore().get("calls", callId);
  if (!call || (!call.invited.includes(personId) && call.started_by !== personId)) throw new DomainError("That call isn't available.");
  return tidy(call);
}

export async function startCall(chatId: string, personId: string, kind: Call["kind"]): Promise<Call> {
  await membership(chatId, personId);
  const store = getStore();
  for (const c of await store.list("calls", { chat_id: chatId })) {
    const live = await tidy(c);
    if (live.state !== "ended") return joinCall(live.id, personId); // join the call already going
  }
  const members = (await chatMembers(chatId)).map((m) => m.person.id);
  if (members.length < 2) throw new DomainError("There's nobody else in this chat to call.");
  const { isBlockedBetween } = await import("./dating");
  for (const m of members) if (m !== personId && (await isBlockedBetween(personId, m))) throw new DomainError("You can't call this person.");
  if (members.length > MAX_PEOPLE) throw new DomainError(`Group calls are limited to ${MAX_PEOPLE} people for now.`);
  const at = stamp();
  const call = await store.insert("calls", {
    id: randomUUID(), chat_id: chatId, kind, started_by: personId, state: "ringing",
    invited: members.filter((m) => m !== personId), participants: [personId], joined_ever: [personId], declined: [],
    presence: { [personId]: at }, created_at: at, connected_at: null, ended_at: null, end_reason: null,
  });
  const chat = await store.get("chats", chatId);
  const me = await store.get("people", personId);
  pushCall(call.invited, call, chat?.kind === "group" ? `${me?.name ?? "Someone"} · ${chat.name ?? "Group"}` : me?.name ?? "Afriheart");
  return call;
}

export async function joinCall(callId: string, personId: string): Promise<Call> {
  const call = await requireCall(callId, personId);
  if (call.state === "ended") throw new DomainError("This call has ended.");
  if (call.participants.includes(personId)) return call;
  if (call.participants.length >= MAX_PEOPLE) throw new DomainError("This call is full.");
  const at = stamp();
  pushCallEnded([personId], callId); // answered here: stop ringing on their other phones
  return getStore().update("calls", callId, {
    participants: [...call.participants, personId],
    joined_ever: [...new Set([...call.joined_ever, personId])],
    presence: { ...call.presence, [personId]: at },
    state: "active",
    connected_at: call.connected_at ?? at,
  });
}

export async function declineCall(callId: string, personId: string): Promise<Call> {
  const call = await requireCall(callId, personId);
  if (call.state !== "ringing") return call;
  const declined = [...new Set([...call.declined, personId])];
  pushCallEnded([personId], callId); // stop this person's other phones ringing
  const updated = await getStore().update("calls", callId, { declined });
  return call.invited.every((p) => declined.includes(p)) ? endCall(updated, "declined") : updated;
}

export async function leaveCall(callId: string, personId: string): Promise<Call> {
  const call = await requireCall(callId, personId);
  if (call.state === "ended") return call;
  const participants = call.participants.filter((p) => p !== personId);
  const updated = await getStore().update("calls", callId, { participants });
  if (call.state === "ringing") return endCall(updated, "cancelled"); // the caller hung up before anyone answered
  return participants.length < 2 ? endCall(updated, "ended") : updated;
}

export interface CallView {
  id: string;
  chat_id: string;
  kind: Call["kind"];
  state: Call["state"];
  end_reason: Call["end_reason"];
  connected_at: string | null;
  started_by: string;
  participants: { id: string; name: string }[];
  invited: { id: string; name: string; declined: boolean }[];
  title: string;
  ice_servers: RTCIceServerLike[];
}

/** A participant's check-in: keeps them in the call and returns who's in it now. */
export async function callView(callId: string, personId: string): Promise<CallView> {
  let call = await requireCall(callId, personId);
  if (call.participants.includes(personId) && call.state !== "ended") {
    call = await getStore().update("calls", callId, { presence: { ...call.presence, [personId]: stamp() } });
  }
  const members = await chatMembers(call.chat_id);
  const name = (id: string) => members.find((m) => m.person.id === id)?.person.name ?? "Someone";
  const chat = await getStore().get("chats", call.chat_id);
  const others = [call.started_by, ...call.invited].filter((p) => p !== personId);
  return {
    id: call.id, chat_id: call.chat_id, kind: call.kind, state: call.state, end_reason: call.end_reason,
    connected_at: call.connected_at, started_by: call.started_by,
    participants: call.participants.map((id) => ({ id, name: name(id) })),
    invited: call.invited.map((id) => ({ id, name: name(id), declined: call.declined.includes(id) })),
    title: chat?.kind === "group" ? chat.name ?? "Group call" : name(others[0] ?? call.started_by),
    ice_servers: iceServers(),
  };
}

/** Calls ringing for this person right now (shown full screen anywhere in the app). */
export async function incomingCalls(personId: string): Promise<CallView[]> {
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const calls = await store.listIn("calls", "chat_id", mine.map((m) => m.chat_id));
  const out: CallView[] = [];
  for (const c of calls) {
    if (c.state === "ended" || !c.invited.includes(personId) || c.participants.includes(personId) || c.declined.includes(personId)) continue;
    const live = await tidy(c);
    const fresh = Date.now() - Date.parse(live.created_at) < RING_SECONDS * 1000;
    if (live.state === "ringing" || (live.state === "active" && fresh && !live.joined_ever.includes(personId))) {
      out.push(await callView(live.id, personId));
    }
  }
  return out;
}

export async function sendSignal(callId: string, from: string, to: string, type: CallSignal["type"], payload: unknown) {
  const call = await requireCall(callId, from);
  if (!call.participants.includes(from)) throw new DomainError("Join the call first.");
  if (![call.started_by, ...call.invited].includes(to)) throw new DomainError("That person isn't in this call.");
  await getStore().insert("call_signals", {
    id: randomUUID(), call_id: callId, from_id: from, to_id: to, type, payload: JSON.stringify(payload ?? null), created_at: stamp(),
  });
}

export async function signalsFor(callId: string, personId: string, after: string | null) {
  await requireCall(callId, personId);
  const signals = await getStore().list("call_signals", { call_id: callId, to_id: personId });
  return signals
    .filter((s) => !after || s.created_at > after)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => ({ id: s.id, from: s.from_id, type: s.type, payload: JSON.parse(s.payload) as unknown, at: s.created_at }));
}

export async function callHistory(personId: string) {
  const store = getStore();
  const mine = await store.list("chat_members", { person_id: personId });
  const calls = (await store.listIn("calls", "chat_id", mine.map((m) => m.chat_id))).filter((c) => c.state === "ended");
  calls.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const out = [];
  for (const c of calls.slice(0, 50)) {
    const members = await chatMembers(c.chat_id);
    const chat = await store.get("chats", c.chat_id);
    const other = members.find((m) => m.person.id !== personId)?.person.name ?? "Someone";
    out.push({
      id: c.id, chat_id: c.chat_id, kind: c.kind, at: c.created_at,
      title: chat?.kind === "group" ? chat.name ?? "Group" : other,
      outgoing: c.started_by === personId,
      missed: !c.connected_at && c.started_by !== personId,
      duration_ms: c.connected_at && c.ended_at ? Date.parse(c.ended_at) - Date.parse(c.connected_at) : null,
    });
  }
  return out;
}
