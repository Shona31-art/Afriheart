import { api } from "@/lib/api";
import { typing } from "@/lib/chat-extras";

/** "typing…" (phones send this at most every few seconds while typing). */
export const POST = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/typing">) => {
  const { id } = await ctx.params;
  return api((me) => typing(id, me));
};
