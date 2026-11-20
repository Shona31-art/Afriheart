import "server-only";
import { fcmSetupProblem, sendCallEnded, sendToAndroid } from "./fcm";

// Wakes Afriheart's Android app when it's closed: calls ring full screen, messages
// pop up. Does nothing until Firebase is configured (see README, "Android app").
// Sending happens after the response, so a slow Firebase never delays a chat.

function later(task: () => Promise<unknown>) {
  if (fcmSetupProblem()) return;
  const run = () => task().catch((e) => console.error("[push]", (e as Error).message));
  import("next/server")
    .then(({ after }) => after(run))
    .catch(() => void run()); // outside a request (tests, scripts)
}

export function pushCall(personIds: string[], call: { id: string; kind: "voice" | "video" }, title: string) {
  later(() => Promise.all(personIds.map((id) =>
    sendToAndroid(id, { type: "call", callId: call.id, title, video: call.kind === "video" ? "1" : "0", url: `/call/${call.id}` }, { urgent: true, ttlSeconds: 45 }))));
}

export function pushCallEnded(personIds: string[], callId: string) {
  if (personIds.length) later(() => sendCallEnded(personIds, callId));
}

export function pushMessage(personIds: string[], chatId: string, title: string, body: string) {
  later(() => Promise.all(personIds.map((id) =>
    sendToAndroid(id, { type: "notice", kind: "message", title, body: body.slice(0, 200), url: `/chats/${chatId}`, tag: `chat-${chatId}` }))));
}

export function pushSupport(personId: string, ticketId: string, title: string, body: string) {
  later(() => sendToAndroid(personId, { type: "notice", kind: "message", title, body: body.slice(0, 200), url: `/support/${ticketId}`, tag: `support-${ticketId}` }));
}
