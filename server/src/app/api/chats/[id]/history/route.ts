import { api } from "@/lib/api";
import { chatHistory } from "@/lib/chat-extras";

/** Every message I can still see in the chat, still encrypted (for search, media and export on the phone). */
export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/history">) => {
  const { id } = await ctx.params;
  return api((me) => chatHistory(id, me));
};
