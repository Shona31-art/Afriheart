import { api, body } from "@/lib/api";
import { addToGroup, leaveGroup } from "@/lib/chat";

export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/members">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => addToGroup(id, me, Array.isArray(b.phones) ? b.phones.map(String) : []));
};

/** Leave the group. */
export const DELETE = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/members">) => {
  const { id } = await ctx.params;
  return api((me) => leaveGroup(id, me));
};
