import { api } from "@/lib/api";
import { messageInfo } from "@/lib/chat-extras";

export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/messages/[mid]/info">) => {
  const { id, mid } = await ctx.params;
  return api((me) => messageInfo(id, me, mid));
};
