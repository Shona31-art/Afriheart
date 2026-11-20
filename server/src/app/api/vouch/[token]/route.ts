import { api, body, s } from "@/lib/api";
import { writeVouch } from "@/lib/vouch";

/** The friend's vouch: { relation, text }. Shows once the person approves it. */
export const POST = async (req: Request, ctx: RouteContext<"/api/vouch/[token]">) => {
  const { token } = await ctx.params;
  const b = await body(req);
  return api((me) => writeVouch(token, me, s(b.relation), s(b.text)));
};
