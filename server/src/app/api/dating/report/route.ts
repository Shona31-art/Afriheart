import { api, body, s } from "@/lib/api";
import { report } from "@/lib/dating";

/** { person_id, reason, details } — also blocks them. */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => report(me, s(b.person_id), s(b.reason), s(b.details)));
};
