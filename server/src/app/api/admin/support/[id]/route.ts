import { api, body } from "@/lib/api";
import { reply, setTicket, thread } from "@/lib/support";

type Ctx = RouteContext<"/api/admin/support/[id]">;
export const GET = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => thread(me, id, true));
};
/** { body } to reply, or { status?, priority?, assign?: "me" | "none" } */
export const POST = async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => (typeof b.body === "string" ? reply(me, id, b.body, true) : setTicket(me, id, b)));
};
