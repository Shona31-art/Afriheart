import { api, body, s } from "@/lib/api";
import { refundPayment } from "@/lib/admin";

/** Records a refund made in the Payfast dashboard: { note }. */
export const POST = async (req: Request, ctx: RouteContext<"/api/admin/payments/[id]">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => refundPayment(me, id, s(b.note)));
};
