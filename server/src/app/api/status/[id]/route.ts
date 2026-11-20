import { api } from "@/lib/api";
import { deleteStatus, viewStatus } from "@/lib/status";

type Ctx = RouteContext<"/api/status/[id]">;
/** Seen. */
export const POST = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => viewStatus(me, id));
};
export const DELETE = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => deleteStatus(me, id));
};
