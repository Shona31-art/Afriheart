import { api } from "@/lib/api";
import { setStar } from "@/lib/chat-extras";

type Ctx = RouteContext<"/api/chats/[id]/messages/[mid]/star">;
export const POST = async (_req: Request, ctx: Ctx) => {
  const { id, mid } = await ctx.params;
  return api((me) => setStar(id, me, mid, true));
};
export const DELETE = async (_req: Request, ctx: Ctx) => {
  const { id, mid } = await ctx.params;
  return api((me) => setStar(id, me, mid, false));
};
