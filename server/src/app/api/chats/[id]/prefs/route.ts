import { api, body } from "@/lib/api";
import { setChatPrefs } from "@/lib/chat-extras";

/** { pin?: boolean, mute?: "8h" | "week" | "always" | "off", archive?: boolean, unread?: boolean } */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/prefs">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => setChatPrefs(id, me, b));
};
