import { api, body, requestOrigin } from "@/lib/api";
import { runPlanIntent } from "@/lib/plan-intents";

/** { intent, ...fields } — the same actions as the plan page's buttons. */
export const POST = async (req: Request, ctx: RouteContext<"/api/plans/[slug]">) => {
  const { slug } = await ctx.params;
  const b = await body(req);
  const input = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v ?? "")]));
  return api(async (me) => ({ next: await runPlanIntent(slug, me, input, await requestOrigin()) }));
};
