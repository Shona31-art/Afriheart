import { api } from "@/lib/api";
import { hideMessage } from "@/lib/chat-extras";

/** "Delete for me". */
export const POST = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/messages/[mid]/hide">) => {
  const { id, mid } = await ctx.params;
  return api((me) => hideMessage(id, me, mid));
};
