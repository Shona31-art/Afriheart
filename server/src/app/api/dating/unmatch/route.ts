import { api, body, s } from "@/lib/api";
import { unmatch } from "@/lib/dating";

export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => unmatch(me, s(b.chat_id)));
};
