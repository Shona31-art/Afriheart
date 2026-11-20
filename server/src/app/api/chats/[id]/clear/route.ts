import { api, body } from "@/lib/api";
import { clearChat } from "@/lib/chat-extras";

/** Clear chat (for me); { delete: true } also removes it from my list until someone writes again. */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/clear">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => clearChat(id, me, b.delete === true));
};
