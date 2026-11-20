import { api, body, s } from "@/lib/api";
import { answerToday, coupleSpace, setTogetherSince } from "@/lib/couple";
import { DomainError } from "@/lib/domain";

/** Couple space for this chat. */
export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/couple">) => {
  const { id } = await ctx.params;
  return api((me) => coupleSpace(id, me));
};

/** { action: "answer", cipher, date } (sealed on the phone) | { action: "since", date } */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/couple">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    if (b.action === "answer") return answerToday(id, me, s(b.cipher), s(b.date));
    if (b.action === "since") return setTogetherSince(id, me, s(b.date));
    throw new DomainError("Unknown action.");
  });
};
