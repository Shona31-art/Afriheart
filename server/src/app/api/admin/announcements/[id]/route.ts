import { api } from "@/lib/api";
import { endAnnouncement } from "@/lib/admin";

export const DELETE = async (_req: Request, ctx: RouteContext<"/api/admin/announcements/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => endAnnouncement(me, id));
};
