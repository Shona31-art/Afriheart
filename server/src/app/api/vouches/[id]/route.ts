import { api, body, s } from "@/lib/api";
import { decideVouch, withdrawVouch } from "@/lib/vouch";

/** Show or hide a vouch about you: { status: "shown" | "hidden" }. */
export const POST = async (req: Request, ctx: RouteContext<"/api/vouches/[id]">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => decideVouch(me, id, s(b.status)));
};

/** Take back a vouch you wrote for a friend. */
export const DELETE = async (_req: Request, ctx: RouteContext<"/api/vouches/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => withdrawVouch(me, id));
};
