import { api, body, s } from "@/lib/api";
import { sendSignal, signalsFor } from "@/lib/calls";
import { DomainError } from "@/lib/domain";

export const GET = async (req: Request, ctx: RouteContext<"/api/calls/[id]/signals">) => {
  const { id } = await ctx.params;
  const after = new URL(req.url).searchParams.get("after");
  return api((me) => signalsFor(id, me, after));
};

/** { to, type: "offer" | "answer" | "ice" | "bye", payload } */
export const POST = async (req: Request, ctx: RouteContext<"/api/calls/[id]/signals">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    const type = s(b.type);
    if (!["offer", "answer", "ice", "bye"].includes(type)) throw new DomainError("Unknown signal.");
    await sendSignal(id, me, s(b.to), type as "offer", b.payload);
  });
};
