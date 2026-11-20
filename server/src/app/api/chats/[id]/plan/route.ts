import { api, body, s } from "@/lib/api";
import { companionPlan, membership } from "@/lib/chat";

/** Ask the companion to draft a plan in this chat. */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/plan">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    await membership(id, me);
    const plan = await companionPlan(id, me, s(b.spark));
    return { slug: plan?.slug ?? null };
  });
};
