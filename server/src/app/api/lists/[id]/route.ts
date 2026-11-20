import { api, body } from "@/lib/api";
import { deleteList, updateList } from "@/lib/chat-lists";

type Ctx = RouteContext<"/api/lists/[id]">;
/** { name?, add?: chat id, remove?: chat id } */
export const POST = async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => updateList(me, id, b));
};
export const DELETE = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => deleteList(me, id));
};
