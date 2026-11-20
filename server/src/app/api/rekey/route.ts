import { api, body, s } from "@/lib/api";
import { pendingRekeys, rekey } from "@/lib/devices";

/** Messages I sent that someone can read once my phone re-sends the key. */
export const GET = () => api((me) => pendingRekeys(me));

/** { message_id, envelope }: the same message, re-encrypted for everyone's current devices. */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => rekey(me, s(b.message_id), b.envelope));
};
