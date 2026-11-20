import { api, body, s } from "@/lib/api";
import { swipeDuo } from "@/lib/double";

/** { to: pair id, action: "like" | "pass" } → { match: { chat_id, title } | null } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => swipeDuo(me, s(b.to), s(b.action)));
};
