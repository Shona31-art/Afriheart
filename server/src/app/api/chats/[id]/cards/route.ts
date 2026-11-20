import { api, body, s } from "@/lib/api";
import { cardGame, playCards, type CardAction } from "@/lib/cards";
import { DomainError } from "@/lib/domain";

/** The talking-cards game in this chat. */
export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/cards">) => {
  const { id } = await ctx.params;
  return api((me) => cardGame(id, me));
};

const ACTIONS: CardAction[] = ["deck", "flip", "next", "back", "shuffle"];

/** { action: "deck", deck } | { action: "flip" | "next" | "back" | "shuffle", at } */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/cards">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api((me) => {
    const action = s(b.action) as CardAction;
    if (!ACTIONS.includes(action)) throw new DomainError("Unknown move.");
    return playCards(id, me, action, { deck: s(b.deck), at: typeof b.at === "number" ? b.at : undefined });
  });
};
