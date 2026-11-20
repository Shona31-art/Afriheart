import { api, body, requestOrigin, s } from "@/lib/api";
import { startCheckout } from "@/lib/plus";

/** { pass: "week" | "month" | "quarter" } → the form that takes the phone to the secure checkout. */
export const POST = async (req: Request) => {
  const b = await body(req);
  const origin = await requestOrigin();
  return api((me) => startCheckout(me, s(b.pass), origin));
};
