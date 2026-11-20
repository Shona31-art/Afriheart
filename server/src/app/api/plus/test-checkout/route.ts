import { api, body, s } from "@/lib/api";
import { testCheckout } from "@/lib/plus";

/** The pretend checkout's buttons (only with ALLOW_TEST_PAYMENTS=yes-insecure). */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => testCheckout(me, s(b.id), b.outcome === "pay" ? "pay" : "cancel"));
};
