import { api } from "@/lib/api";
import { incomingCalls } from "@/lib/calls";
import { unreadTotal } from "@/lib/chat";
import { pendingRekeys } from "@/lib/devices";

/** What every screen polls: calls ringing for me, and the unread count for the badge. */
export const GET = () => api(async (me) => ({
  me,
  incoming: await incomingCalls(me),
  unread: await unreadTotal(me),
  rekey: (await pendingRekeys(me)).length,
}));
