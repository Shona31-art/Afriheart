import { api, body } from "@/lib/api";
import { setDisappearing, setGroupPermissions, updateGroup } from "@/lib/chat-extras";

/** { disappear_secs?, name?, description?, admins_only_send?, admins_only_info? } */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/settings">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    if (typeof b.disappear_secs === "number") await setDisappearing(id, me, b.disappear_secs);
    if (typeof b.name === "string" || typeof b.description === "string") await updateGroup(id, me, b);
    if (typeof b.admins_only_send === "boolean" || typeof b.admins_only_info === "boolean") await setGroupPermissions(id, me, b);
  });
};
