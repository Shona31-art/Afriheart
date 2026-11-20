import { api } from "@/lib/api";
import { paymentFor } from "@/lib/plus";

/** Whether a payment went through (checked after coming back from the checkout). */
export const GET = async (_req: Request, ctx: RouteContext<"/api/plus/payments/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => paymentFor(me, id));
};
