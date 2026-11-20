import { api, body, s } from "@/lib/api";
import { swipe } from "@/lib/dating";

/** { to, action: "like" | "pass" | "date", target?: "photo:<path>" | "prompt:<id>" | "voice", comment? } → { match: { chat_id, name } | null } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => swipe(me, s(b.to), s(b.action) as "like", s(b.target), s(b.comment)));
};
