import { api } from "@/lib/api";
import { deleteMessage } from "@/lib/chat";

export const DELETE = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/messages/[mid]">) => {
  const { id, mid } = await ctx.params;
  return api((me) => deleteMessage(id, me, mid));
};
