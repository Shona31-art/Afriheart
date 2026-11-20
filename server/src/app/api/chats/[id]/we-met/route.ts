import { api, body } from "@/lib/api";
import { answerWeMet, weMetAsk } from "@/lib/we-met";

/** Should I be asked "Did you meet?" here? → { ask: { about_id, name } | null } */
export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/we-met">) => {
  const { id } = await ctx.params;
  return api(async (me) => ({ ask: await weMetAsk(id, me) }));
};

/** Answer privately: { met: true | false | null, again?, as_pictured? } */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/we-met">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => answerWeMet(id, me, b));
};
