import { api } from "@/lib/api";
import { markOpened } from "@/lib/chat-extras";

/** A view-once photo was opened on this phone. */
export const POST = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/messages/[mid]/opened">) => {
  const { id, mid } = await ctx.params;
  return api((me) => markOpened(id, me, mid));
};
