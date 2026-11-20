import { api, body } from "@/lib/api";
import { setPrivacy } from "@/lib/chat-extras";

/** { hide_last_seen?: boolean, read_receipts_off?: boolean } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => setPrivacy(me, b));
};
