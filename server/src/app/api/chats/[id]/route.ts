import { api } from "@/lib/api";
import { thread } from "@/lib/chat";

export const GET = async (req: Request, ctx: RouteContext<"/api/chats/[id]">) => {
  const { id } = await ctx.params;
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  return api((me) => thread(id, me, after));
};
