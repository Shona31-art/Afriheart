import { api } from "@/lib/api";
import { chatDevices } from "@/lib/devices";

export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/devices">) => {
  const { id } = await ctx.params;
  return api((me) => chatDevices(id, me));
};
