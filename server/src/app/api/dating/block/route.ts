import { api, body, s } from "@/lib/api";
import { block } from "@/lib/dating";

export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => block(me, s(b.person_id)));
};
