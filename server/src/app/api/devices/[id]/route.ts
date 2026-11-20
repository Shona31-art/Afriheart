import { api } from "@/lib/api";
import { deviceKeys, revokeDevice } from "@/lib/devices";

export const GET = async (_req: Request, ctx: RouteContext<"/api/devices/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => deviceKeys(id, me));
};

/** Log out a device: it stops receiving new messages. */
export const DELETE = async (_req: Request, ctx: RouteContext<"/api/devices/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => revokeDevice(me, id));
};
