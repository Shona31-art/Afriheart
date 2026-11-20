import { api, body } from "@/lib/api";
import { reply, thread } from "@/lib/support";

type Ctx = RouteContext<"/api/support/[id]">;
export const GET = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => thread(me, id, false));
};
/** { body, attachment? } */
export const POST = async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => reply(me, id, b.body, false, b.attachment));
};
