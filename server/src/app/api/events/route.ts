import { getSessionPersonId } from "@/lib/session";
import { hub, type Nudge } from "@/lib/realtime";
import { touchPresence } from "@/lib/chat-extras";

// The realtime connection: one per signed-in phone. Sends a tiny nudge when one
// of the person's chats or calls changes; the phone then fetches the update.
// Closes itself after four minutes (hosting limits long requests); the browser
// reconnects straight away.

const LIFETIME_MS = 4 * 60 * 1000;
const HEARTBEAT_MS = 20 * 1000;

export async function GET(req: Request) {
  const me = await getSessionPersonId();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => { try { controller.enqueue(enc.encode(text)); } catch { cleanup(); } };
      send("retry: 1500\n: connected\n\n");
      const off = hub().subscribe(me, (n: Nudge) => send(n.typing
        ? `event: typing\ndata: ${JSON.stringify({ chat: n.typing, who: n.who ?? null })}\n\n`
        : `event: nudge\ndata: ${JSON.stringify({ chat: n.chat ?? null, call: n.call ?? null })}\n\n`));
      // While connected, this person is "online"; "last seen" is when it last checked in.
      touchPresence(me, true).catch(() => undefined);
      const beat = setInterval(() => { send(": keep-alive\n\n"); touchPresence(me).catch(() => undefined); }, HEARTBEAT_MS);
      const end = setTimeout(() => cleanup(), LIFETIME_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        off();
        clearInterval(beat);
        touchPresence(me, true).catch(() => undefined);
        clearTimeout(end);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
