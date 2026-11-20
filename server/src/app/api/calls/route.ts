import { api, body, s } from "@/lib/api";
import { callHistory, callView, startCall } from "@/lib/calls";

export const GET = () => api((me) => callHistory(me));

/** Start (or join the one already going in) a call in a chat: { chat_id, kind: "voice" | "video" } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    const call = await startCall(s(b.chat_id), me, s(b.kind) === "video" ? "video" : "voice");
    return callView(call.id, me);
  });
};
