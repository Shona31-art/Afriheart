import { api } from "@/lib/api";
import { markRead } from "@/lib/chat";

export const POST = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/read">) => {
  const { id } = await ctx.params;
  return api((me) => markRead(id, me));
};
