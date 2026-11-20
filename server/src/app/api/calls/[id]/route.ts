import { api, body, s } from "@/lib/api";
import { callView, declineCall, joinCall, leaveCall } from "@/lib/calls";
import { DomainError } from "@/lib/domain";

/** Check in: who's in the call now. Phones in a call call this every few seconds. */
export const GET = async (_req: Request, ctx: RouteContext<"/api/calls/[id]">) => {
  const { id } = await ctx.params;
  return api((me) => callView(id, me));
};

/** { action: "join" | "decline" | "leave" } */
export const POST = async (req: Request, ctx: RouteContext<"/api/calls/[id]">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    const action = s(b.action);
    if (action === "join") await joinCall(id, me);
    else if (action === "decline") await declineCall(id, me);
    else if (action === "leave") await leaveCall(id, me);
    else throw new DomainError("Unknown call action.");
    return callView(id, me);
  });
};
