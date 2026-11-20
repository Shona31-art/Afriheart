import { api } from "@/lib/api";
import { joinByInvite } from "@/lib/chat-extras";

/** Join a group with its invite link. */
export const POST = async (_req: Request, ctx: RouteContext<"/api/join/[token]">) => {
  const { token } = await ctx.params;
  return api((me) => joinByInvite(token, me));
};
