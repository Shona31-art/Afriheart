import { api, body } from "@/lib/api";
import { inviteLink } from "@/lib/chat-extras";

/** The group's invite link; { reset: true } makes a new one (the old link stops working). */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/invite">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => inviteLink(id, me, b.reset === true));
};
