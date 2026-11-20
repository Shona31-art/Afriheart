"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ThreadData } from "@/lib/chat";
import { apiGet, apiSend, clock, dayLabel, formatPhone } from "@/lib/client";
import { IconBack, IconHeart, IconLock, IconMore, IconPhone, IconStar, IconTimer, IconVideo } from "./icons";
import { ChatHeaderMenu } from "./chat-header-menu";
import { Avatar } from "./avatar";
import { Composer } from "./composer";
import { PlanCardView } from "./plan-card";
import { VoicePlayer } from "./voice-player";
import { Gentle, SealedContent, useOpened } from "./sealed";
import { ReportSheet } from "./report-sheet";
import { WeMetCard } from "./we-met";
import { chatDevices, myDevice, sendEncrypted } from "@/lib/e2e-device";
import type { Payload, Quote } from "@/lib/e2e-crypto";
import { backupPoll, useLive, useTyping } from "@/lib/live";
import { groupReactions, lastSeenText, payloadText, useMetas, type MetaState } from "@/lib/chat-meta";
import { copyText, ForwardSheet, InfoSheet, MessageSheet } from "./message-actions";
import { ThreadSearch } from "./thread-search";
import { useTheme } from "@/lib/wallpaper";
import { onlyEmoji } from "@/lib/expressions";

type Msg = ThreadData["messages"][number];
const EDIT_MS = 15 * 60 * 1000;
const DELETE_ALL_MS = 60 * 60 * 60 * 1000;

export function Thread({ chatId, me, initial }: { chatId: string; me: { id: string; name: string }; initial: ThreadData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [messages, setMessages] = useState<Msg[]>(initial.messages);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [reporting, setReporting] = useState<{ id: string; name: string; text: string } | null>(null);
  const [sheet, setSheet] = useState<{ m: Msg; payload: Payload | null; at: number } | null>(null);
  const [replyTo, setReplyTo] = useState<Quote | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [forwarding, setForwarding] = useState<Payload | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const cursor = useRef(initial.server_time);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastRead = useRef<string>("");
  const theme = useTheme(chatId);

  const merge = useCallback((incoming: Msg[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const refresh = useCallback(async () => {
    const next = await apiGet<ThreadData>(`/api/chats/${chatId}?after=${encodeURIComponent(cursor.current)}`);
    cursor.current = next.server_time;
    setData(next);
    // Messages deleted for me, cleared or disappeared since: the server no longer sends them, so
    // reload the whole window now and then (cheap: only when something was removed is it noticeable).
    merge(next.messages);
    return next;
  }, [chatId, merge]);

  const reloadAll = useCallback(async () => {
    const next = await apiGet<ThreadData>(`/api/chats/${chatId}`);
    cursor.current = next.server_time;
    setData(next);
    setMessages(next.messages);
  }, [chatId]);

  // Make sure this phone has its encryption keys before anyone sends to it.
  const [keysError, setKeysError] = useState(false);
  const [changed, setChanged] = useState<string[]>([]);
  useEffect(() => {
    myDevice(me.id).catch(() => setKeysError(true));
  }, [me.id]);

  // Trust on first use: tell the person when someone in the chat starts using a new device.
  useEffect(() => {
    let live = true;
    const key = `common-known-devices-${chatId}`;
    chatDevices(chatId, true).then((list) => {
      if (!live) return;
      const others = list.filter((d) => d.person_id !== me.id);
      let known: Record<string, string[]> = {};
      try { known = JSON.parse(localStorage.getItem(key) ?? "{}") ?? {}; } catch { known = {}; }
      if (Array.isArray(known)) known = {};
      const changedPeople = [...new Set(others.filter((d) => known[d.person_id]?.length && !known[d.person_id].includes(d.id)).map((d) => d.person_id))];
      setChanged(changedPeople.map((pid) => initial.members.find((m) => m.id === pid)?.name.split(" ")[0] ?? "Someone"));
      const next: Record<string, string[]> = {};
      for (const d of others) (next[d.person_id] ??= []).push(d.id);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* fine */ }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [chatId, me.id, initial.members]);

  // New messages, ticks and plan updates: fetched the moment a realtime nudge for this
  // chat arrives, with a slow backup poll (quick again if the live connection drops).
  const kick = useRef<() => void>(() => {});
  const isLive = useLive((n) => { if (n.chat === chatId || n.resync) kick.current(); });
  const liveRef = useRef(isLive);
  useEffect(() => { liveRef.current = isLive; }, [isLive]);
  useEffect(() => {
    let stop = false;
    let busy = false;
    let again = false;
    let rounds = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      clearTimeout(t);
      if (busy) { again = true; return; }
      busy = true;
      try {
        // Every 10th check reloads the window, so "delete for me" on another phone and expired messages disappear here too.
        if (++rounds % 10 === 0) await reloadAll(); else await refresh();
      } catch {
        // offline: try again
      }
      busy = false;
      if (stop) return;
      if (again) { again = false; tick(); return; }
      t = setTimeout(tick, document.hidden ? Math.max(8000, backupPoll(liveRef.current, 1500)) : backupPoll(liveRef.current, 1500));
    };
    kick.current = tick;
    t = setTimeout(tick, 600);
    return () => {
      stop = true;
      kick.current = () => {};
      clearTimeout(t);
    };
  }, [refresh, reloadAll]);

  // Disappearing messages leave the screen when their time is up.
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date().toISOString();
      setMessages((prev) => (prev.some((m) => m.expires_at && m.expires_at <= now) ? prev.filter((m) => !m.expires_at || m.expires_at > now) : prev));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(() => messages.filter((m) => !m.meta), [messages]);
  const metas = useMetas(chatId, me.id, messages);

  // Read receipts: tell the server once newer messages from others are on screen.
  useEffect(() => {
    const latest = [...visible].reverse().find((m) => m.sender_id && m.sender_id !== me.id);
    if (!latest || latest.created_at <= lastRead.current || document.hidden) return;
    lastRead.current = latest.created_at;
    apiSend(`/api/chats/${chatId}/read`, "POST").catch(() => undefined);
  }, [visible, chatId, me.id]);

  // Stick to the bottom like a messenger, unless the person scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [visible, metas]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      atBottom.current = true;
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function call(kind: "voice" | "video") {
    await act(async () => {
      const c = await apiSend<{ id: string }>("/api/calls", "POST", { chat_id: chatId, kind });
      router.push(`/call/${c.id}`);
    });
  }

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2500);
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`m-${id}`);
    if (!el) return flash("That message is further back. Use search to find it.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("msg-flash");
    setTimeout(() => el.classList.remove("msg-flash"), 1600);
  }

  const isGroup = data.chat.kind === "group";
  const others = data.members.filter((m) => m.id !== me.id);
  const firstName = (id: string) => (id === me.id ? "You" : data.members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone");

  // "typing…" — but not for someone whose message has just arrived.
  const typingAll = useTyping();
  const typingNow = (typingAll[chatId] ?? []).filter((t) => t.who !== me.id && !visible.some((m) => m.sender_id === t.who && Date.parse(m.created_at) > t.until - 6000));
  const presence = lastSeenText(data.presence);
  const subtitle = typingNow.length
    ? isGroup ? `${typingNow.map((t) => firstName(t.who)).join(", ")} ${typingNow.length > 1 ? "are" : "is"} typing…` : "typing…"
    : !isGroup && presence ? presence
    : data.chat.is_match ? "Matched on Afriheart" : isGroup ? data.members.map((m) => (m.id === me.id ? "You" : m.name.split(" ")[0])).join(", ") : others[0]?.phone ? formatPhone(others[0].phone) : "";

  async function react(m: Msg, emoji: string) {
    setSheet(null);
    await act(() => sendEncrypted(chatId, me.id, { t: "react", emoji }, { meta: "react", target: m.id }));
  }

  async function vote(m: Msg, options: number[]) {
    await act(() => sendEncrypted(chatId, me.id, { t: "vote", options }, { meta: "vote", target: m.id }));
  }

  function quoteOf(m: Msg, p: Payload | null): Quote {
    const text = p ? (metas.edits.get(m.id) ?? payloadText(p)) : m.body || "Message";
    return { id: m.id, name: m.sender_id === me.id ? "You" : m.sender_name ?? "Someone", text: text.slice(0, 160) };
  }

  const s = sheet;
  const sheetMine = s?.m.sender_id === me.id;
  const age = s ? s.at - Date.parse(s.m.created_at) : 0;

  return (
    <div className="fixed inset-0 mx-auto flex max-w-xl flex-col bg-paper lg:left-[380px] lg:mx-0 lg:max-w-none">
      <header className="flex items-center gap-1 border-b border-[#d6b77e]/25 bg-brand px-1 py-1.5 pt-[max(.375rem,env(safe-area-inset-top))] text-white">
        <Link href="/" className="icon-btn" aria-label="Back to chats"><IconBack /></Link>
        <Link href={`/chats/${chatId}/info`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-1">
          <Avatar name={data.chat.title} seed={chatId} group={isGroup} size={38} className="ring-2 ring-white/40" />
          <div className="min-w-0">
            <h1 className="display truncate text-[1.25rem] leading-tight">{data.chat.title}</h1>
            <p className="truncate text-xs text-white/85" data-chat-subtitle aria-live="polite">{subtitle}<span className="sr-only">: chat info and security code</span></p>
          </div>
        </Link>
        <button onClick={() => call("video")} className="icon-btn" aria-label="Video call"><IconVideo /></button>
        <button onClick={() => call("voice")} className="icon-btn" aria-label="Voice call"><IconPhone /></button>
        {!isGroup && <Link href={`/chats/${chatId}/az`} className="icon-btn text-[13px] font-bold tracking-tight" aria-label="A–Z: Alphabet date ideas">A–Z</Link>}
        <ChatHeaderMenu chatId={chatId} me={me.id} chat={data.chat} members={data.members} onSearch={() => setSearching(true)} onToast={flash} onChanged={() => { refresh().catch(() => undefined); }}
          onReport={() => { const o = others[0]; if (o) setReporting({ id: o.id, name: o.name, text: "" }); }} />
      </header>

      <aside aria-label="Chat notices" className="contents">
      {data.active_call && (
        <Link href={`/call/${data.active_call.id}`} className="flex items-center justify-between bg-live px-4 py-2 text-sm font-semibold text-white">
          <span className="flex items-center gap-2">{data.active_call.kind === "video" ? <IconVideo size={18} /> : <IconPhone size={18} />} Call in progress · {data.active_call.participants} in the call</span>
          <span className="rounded-full bg-black/25 px-3 py-0.5">Join</span>
        </Link>
      )}

      {keysError && <p role="alert" className="bg-warm-soft px-4 py-2 text-sm text-warm-ink">This phone couldn&apos;t set up its encryption keys, so it can&apos;t send or read messages. Check your connection and reopen the chat.</p>}
      {changed.length > 0 && (
        <Link href={`/chats/${chatId}/info`} className="flex items-start gap-2 bg-notice text-notice-ink px-4 py-2 text-left text-sm" onClick={() => setChanged([])}>
          <IconLock size={16} className="mt-0.5 shrink-0" />
          <span>{changed.join(", ")} started using a new phone or browser, so the security code changed. Tap to check it.</span>
        </Link>
      )}
      </aside>
      <main ref={scroller} aria-label="Messages" className="chat-bg flex-1 overflow-y-auto px-3 py-3 lg:px-[max(1.5rem,calc(50%-26rem))]" data-wall={theme.wall} data-bubbles={theme.bubbles}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}>
        <Link href={`/chats/${chatId}/info`} className="mx-auto mb-3 flex max-w-xs items-start gap-1.5 rounded-lg bg-notice text-notice-ink px-3 py-1.5 text-xs ">
          <IconLock size={14} className="mt-0.5 shrink-0" />
          <span>Messages, photos, voice notes and calls are end-to-end encrypted. Only people in this chat can read or hear them. Messages to @afri go to the assistant. Tap to verify.</span>
        </Link>
        {data.chat.disappear_secs ? (
          <Link href={`/chats/${chatId}/info#disappearing`} className="mx-auto mb-3 flex max-w-xs items-center gap-1.5 rounded-lg bg-notice px-3 py-1.5 text-xs text-notice-ink" data-disappearing-on>
            <IconTimer size={14} className="shrink-0" />
            <span>Disappearing messages are on. New messages disappear {data.chat.disappear_secs === 86400 ? "24 hours" : data.chat.disappear_secs === 604800 ? "7 days" : "90 days"} after they&apos;re sent.</span>
          </Link>
        ) : null}
        {visible.length === 0 && (
          <p className="mx-auto mt-6 max-w-xs rounded-xl bg-card/90 px-4 py-3 text-center text-sm text-muted">
            Say hi 👋 Or tap + then “Make a plan” to plan something together.
          </p>
        )}
        {visible.map((m, i) => {
          const day = dayLabel(m.created_at);
          const prev = visible[i - 1];
          const showDay = !prev || dayLabel(prev.created_at) !== day;
          const grouped = prev && prev.sender_id === m.sender_id && !showDay && prev.kind !== "system";
          return (
            <div key={m.id} id={`m-${m.id}`} className="rounded-xl transition-colors">
              {showDay && <p className="my-3 text-center"><span className="rounded-lg bg-card/90 px-3 py-1 text-xs text-muted shadow-sm">{day}</span></p>}
              <MessageRow chatId={chatId} m={m} me={me.id} isGroup={isGroup} grouped={!!grouped} plan={m.plan_id ? data.plans[m.plan_id] : undefined} dateWith={data.chat.is_match ? data.chat.title : undefined}
                members={data.members} metas={metas} starred={data.starred.includes(m.id)}
                onPlan={(body) => act(() => apiSend(`/api/plans/${data.plans[m.plan_id!]?.slug}`, "POST", body))}
                onImage={setViewer} onCall={call}
                onOptions={(payload) => setSheet({ m, payload, at: Date.now() })}
                onReact={(emoji) => react(m, emoji)}
                onVote={(options) => vote(m, options)}
                onQuote={jumpTo}
                onOpenedOnce={() => apiSend(`/api/chats/${chatId}/messages/${m.id}/opened`, "POST").then(() => refresh()).catch(() => undefined)}
                onReport={(text) => m.sender_id && setReporting({ id: m.sender_id, name: data.members.find((x) => x.id === m.sender_id)?.name ?? "this person", text })} />
            </div>
          );
        })}
      </main>

      {toast && <p role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg">{toast}</p>}
      {error && (
        <div role="alert" className="flex items-start justify-between gap-2 bg-warm-soft px-4 py-2 text-sm text-warm-ink">
          <span>{error}</span>
          <button className="shrink-0 font-semibold underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {data.chat.is_match && <WeMetCard chatId={chatId} />}
      {data.chat.can_send ? (
        <Composer chatId={chatId} personId={me.id} direct={data.chat.kind === "direct"} members={isGroup ? others : []}
          replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
          editing={editing} onCancelEdit={() => setEditing(null)}
          onSent={() => { atBottom.current = true; setReplyTo(null); setEditing(null); return refresh(); }} onError={setError} />
      ) : (
        <p className="border-t border-line bg-card px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-muted" data-admins-only>
          Only <Link href={`/chats/${chatId}/info`} className="font-semibold text-accent underline">admins</Link> can send messages.
        </p>
      )}

      {s && (
        <MessageSheet chatId={chatId} mine={sheetMine} starred={data.starred.includes(s.m.id)} payload={s.payload}
          myReaction={metas.reactions.get(s.m.id)?.get(me.id) ?? null}
          canEdit={sheetMine && s.payload?.t === "text" && age < EDIT_MS}
          canDeleteForAll={sheetMine && age < DELETE_ALL_MS}
          onClose={() => setSheet(null)}
          onReact={(e) => react(s.m, e)}
          onReply={() => { setReplyTo(quoteOf(s.m, s.payload)); setEditing(null); setSheet(null); }}
          onCopy={async () => {
            const p = s.payload;
            const text = !p ? s.m.body : p.t === "text" ? metas.edits.get(s.m.id) ?? p.text : p.t === "image" ? p.caption ?? "" : p.t === "location" ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` : p.t === "contact" ? `${p.name} ${formatPhone(p.phone)}` : "";
            setSheet(null);
            flash((await copyText(text)) ? "Copied" : "Couldn't copy on this phone");
          }}
          onForward={() => { setForwarding(s.payload); setSheet(null); }}
          onStar={() => { const on = !data.starred.includes(s.m.id); setSheet(null); act(() => apiSend(`/api/chats/${chatId}/messages/${s.m.id}/star`, on ? "POST" : "DELETE")).then(() => flash(on ? "Starred" : "Unstarred")); }}
          onEdit={() => { if (s.payload?.t === "text") setEditing({ id: s.m.id, text: metas.edits.get(s.m.id) ?? s.payload.text }); setReplyTo(null); setSheet(null); }}
          onInfo={() => { setInfoId(s.m.id); setSheet(null); }}
          onDeleteMe={() => { setSheet(null); act(() => apiSend(`/api/chats/${chatId}/messages/${s.m.id}/hide`, "POST")).then(reloadAll); }}
          onDeleteAll={() => { setSheet(null); act(() => apiSend(`/api/chats/${chatId}/messages/${s.m.id}`, "DELETE")); }}
          onReport={s.m.sender_id && !sheetMine ? () => { const m = s.m; setSheet(null); setReporting({ id: m.sender_id!, name: m.sender_name ?? "this person", text: s.payload?.t === "text" ? s.payload.text : "" }); } : undefined} />
      )}
      {forwarding && <ForwardSheet personId={me.id} payload={forwarding} onClose={() => setForwarding(null)} onDone={(n) => { setForwarding(null); flash(n === 1 ? "Forwarded" : `Forwarded to ${n} chats`); }} />}
      {infoId && <InfoSheet chatId={chatId} messageId={infoId} onClose={() => setInfoId(null)} />}
      {searching && <ThreadSearch chatId={chatId} me={me.id} onClose={() => setSearching(false)} onJump={(id) => { setSearching(false); setTimeout(() => jumpTo(id), 50); }} />}

      {reporting && (
        <ReportSheet personId={reporting.id} name={reporting.name} initialReason="harassment"
          initialDetails={reporting.text ? `The message: "${reporting.text.slice(0, 500)}"` : ""}
          onClose={() => setReporting(null)} onDone={() => { setReporting(null); router.push("/"); }} />
      )}
      {viewer && (
        <button className="fixed inset-0 z-40 flex items-center justify-center bg-black/90" onClick={() => setViewer(null)} aria-label="Close photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}

function Ticks({ status }: { status: Msg["status"] }) {
  if (!status) return null;
  return <span className={`tick ${status === "read" ? "tick-read" : ""}`} aria-label={status}>{status === "sent" ? "✓" : "✓✓"}</span>;
}

/** Long-press (or right-click) opens the message options, like WhatsApp. */
function usePress(onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => { timer.current = null; navigator.vibrate?.(15); onLong(); }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancel(); onLong(); },
  };
}

function MessageRow({ chatId, m, me, isGroup, grouped, plan, dateWith, members, metas, starred, onPlan, onImage, onCall, onOptions, onReact, onVote, onQuote, onOpenedOnce, onReport }: {
  chatId: string; m: Msg; me: string; dateWith?: string; isGroup: boolean; grouped: boolean; plan?: ThreadData["plans"][string];
  members: ThreadData["members"]; metas: MetaState; starred: boolean;
  onPlan: (body: Record<string, string>) => void; onImage: (src: string) => void; onCall: (kind: "voice" | "video") => void;
  onOptions: (payload: Payload | null) => void; onReact: (emoji: string) => void; onVote: (options: number[]) => void; onQuote: (id: string) => void;
  onOpenedOnce: () => void; onReport: (text: string) => void;
}) {
  const opened = useOpened(chatId, me, m.kind === "encrypted" ? m.cipher : null, m.sender_id);
  const payload = opened?.ok ? opened.payload : null;
  const press = usePress(() => onOptions(payload));
  if (m.kind === "like") {
    let like: { by?: string; label?: string; quote?: string | null; comment?: string | null } = {};
    try { like = JSON.parse(m.body); } catch { /* old or broken: show nothing extra */ }
    const mineLike = m.sender_id === me;
    return (
      <div className={`my-2 flex ${mineLike ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[85%] rounded-2xl border border-accent/30 bg-card px-3 py-2 text-sm shadow-sm" data-like-card>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent"><IconHeart size={14} fill="currentColor" /> {mineLike ? "You" : like.by} liked {like.label}</p>
          {like.quote && <p className="mt-1 border-l-2 border-line pl-2 italic text-muted">{like.quote}</p>}
          {like.comment && <Gentle text={like.comment} mine={mineLike} onReport={onReport}><p className="mt-1 text-[15px]">{like.comment}</p></Gentle>}
        </div>
      </div>
    );
  }
  if (m.kind === "system") {
    return <p className="my-2 text-center"><span className="inline-block max-w-[90%] rounded-lg bg-notice px-3 py-1 text-xs text-notice-ink">{m.body}</span></p>;
  }
  if (m.kind === "call") {
    const missed = m.body.includes("Missed") || m.body.includes("declined");
    return (
      <div className="my-2 flex justify-center">
        <button onClick={() => onCall(m.body.includes("📹") ? "video" : "voice")}
          className={`rounded-xl bg-card px-4 py-2 text-sm shadow-sm ${missed && m.sender_id !== me ? "text-danger" : ""}`}>
          {m.body} · {clock(m.created_at)} <span className="ml-2 font-semibold text-accent">Call back</span>
        </button>
      </div>
    );
  }
  if (m.kind === "plan") {
    return <div className="my-2">{plan ? <PlanCardView card={plan} onAct={onPlan} dateWith={dateWith} /> : <p className="text-sm">📅 {m.body}</p>}</div>;
  }
  if (m.kind === "companion") {
    return (
      <div className="my-2 max-w-[88%] rounded-2xl border border-accent/30 bg-accent-soft/90 px-3 py-2 text-sm shadow-sm">
        <p className="mb-0.5 text-xs font-bold text-accent">✨ Afriheart</p>
        <p className="whitespace-pre-wrap">{m.body}</p>
        <p className="text-right text-[11px] text-muted">{clock(m.created_at)}</p>
      </div>
    );
  }
  const mine = m.sender_id === me;
  const reactions = groupReactions(metas.reactions.get(m.id), me);
  const names = new Map(members.map((x) => [x.id, x.id === me ? "You" : x.name.split(" ")[0]]));
  const reactedBy = [...(metas.reactions.get(m.id) ?? new Map<string, string>()).entries()].map(([who, e]) => `${names.get(who) ?? "Someone"} ${e}`).join(", ");
  const myReaction = metas.reactions.get(m.id)?.get(me) ?? null;
  // Stickers and messages of only one to three emojis show without a bubble, like WhatsApp.
  const bare = !!payload && !("re" in payload && payload.re) && (payload.t === "sticker" || (payload.t === "text" && !metas.edits.has(m.id) && onlyEmoji(payload.text)));
  return (
    <div className={`flex ${grouped ? "mt-0.5" : "mt-2"} ${reactions.length ? "mb-3" : ""} ${mine ? "justify-end" : "justify-start"}`}>
      <div className={bare ? "relative max-w-[82%] select-text" : `bubble relative select-text ${mine ? "bubble-me" : "bubble-them"}`} {...press} data-message={m.id}>
        {isGroup && !mine && !grouped && <p className="text-xs font-bold" style={{ color: "#c4572e" }}>{m.sender_name}</p>}
        {m.kind === "image" && m.media_path && (
          <button onClick={(e) => { e.stopPropagation(); onImage(`/api/media/${m.media_path}`); }} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${m.media_path}`} alt="Photo" className="max-h-72 w-full rounded-lg object-cover" loading="lazy" />
          </button>
        )}
        {m.kind === "voice" && m.media_path && <VoicePlayer src={`/api/media/${m.media_path}`} ms={m.media_ms} />}
        {m.kind === "encrypted"
          ? <SealedContent opened={opened} onImage={onImage} mine={mine} onReport={onReport}
              ctx={{ msgId: m.id, chatId, me, senderId: m.sender_id, members, edited: metas.edits.get(m.id), votes: metas.votes.get(m.id), openedBy: m.opened_by, onVote, onQuote, onOpenedOnce }} />
          : m.body && <span className="text-[15px] leading-snug">{m.body}</span>}
        <span className={bare ? `mt-0.5 flex w-fit items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[11px] text-muted shadow-sm ${mine ? "ml-auto" : ""}` : "float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-muted"}>
          {starred && <IconStar size={12} aria-label="Starred" data-starred />}
          {m.expires_at && <IconTimer size={12} aria-label="Disappearing" />}
          {clock(m.created_at)} {mine && <Ticks status={m.status} />}
        </span>
        <button className="sr-only focus:not-sr-only focus:absolute focus:-top-2 focus:right-1 focus:rounded-full focus:bg-card focus:p-1 focus:shadow"
          onClick={(e) => { e.stopPropagation(); onOptions(payload); }} aria-label="Message options"><IconMore size={18} /></button>
        {reactions.length > 0 && (
          <button className={`absolute -bottom-4 ${mine ? "right-2" : "left-2"} flex items-center gap-0.5 rounded-full border border-line bg-card px-1.5 py-0.5 text-sm shadow-sm`}
            onClick={(e) => { e.stopPropagation(); onReact(myReaction ? "" : reactions[0][0]); }}
            aria-label={`Reactions: ${reactedBy}. ${myReaction ? "Tap to remove yours" : "Tap to react too"}`} data-reactions>
            {reactions.slice(0, 3).map(([e]) => <span key={e} aria-hidden>{e}</span>)}
            {reactions.reduce((n, r) => n + r[1], 0) > 1 && <span className="ml-0.5 text-xs text-muted" aria-hidden>{reactions.reduce((n, r) => n + r[1], 0)}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
