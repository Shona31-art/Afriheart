import "server-only";
import { randomInt } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { chatMembers, membership } from "./chat";
import { dealOrder, deckById, type DeckId } from "./card-decks";
import type { CardGame } from "./types";

export interface CardGameView {
  deck: DeckId | null;
  /** 0-based card number; equals total when the deck has been played through. */
  position: number;
  total: number;
  flipped: boolean;
  /** Only once the card is turned over. */
  question: string | null;
  /** Whose turn it is to answer this card. */
  answerer: { id: string; name: string } | null;
  updated_by: string | null;
  /** Someone in this chat has Afriheart+, so every deck is open. */
  plus: boolean;
}

export type CardAction = "deck" | "flip" | "next" | "back" | "shuffle";

async function chatHasPlus(chatId: string): Promise<boolean> {
  const { hasPlus } = await import("./plus");
  for (const m of await chatMembers(chatId)) if (await hasPlus(m.person.id)) return true;
  return false;
}

async function view(chatId: string, game: CardGame | null): Promise<CardGameView> {
  const deck = game ? deckById(game.deck) : undefined;
  const plus = await chatHasPlus(chatId);
  if (!game || !deck) return { deck: null, position: 0, total: 0, flipped: false, question: null, answerer: null, updated_by: null, plus };
  const total = deck.questions.length;
  const done = game.position >= total;
  // Turns go round the chat, starting with whoever chose the deck.
  const members = (await chatMembers(chatId)).sort((a, b) => a.member.joined_at.localeCompare(b.member.joined_at) || a.person.id.localeCompare(b.person.id));
  const start = Math.max(0, members.findIndex((m) => m.person.id === game.started_by));
  const turn = members.length ? members[(start + game.position) % members.length].person : null;
  return {
    deck: deck.id,
    position: Math.min(game.position, total),
    total,
    flipped: !done && game.flipped,
    question: !done && game.flipped ? deck.questions[dealOrder(game.seed, total)[game.position]] : null,
    answerer: done || !turn ? null : { id: turn.id, name: turn.name },
    updated_by: game.updated_by,
    plus,
  };
}

export async function cardGame(chatId: string, personId: string): Promise<CardGameView> {
  await membership(chatId, personId);
  return view(chatId, await getStore().get("card_games", chatId));
}

/**
 * One move. `at` is the card the phone was looking at: if someone else moved first
 * (both tapped "Next" at once), the move is skipped so nobody loses a card.
 */
export async function playCards(chatId: string, personId: string, action: CardAction, opts: { deck?: string; at?: number } = {}): Promise<CardGameView> {
  await membership(chatId, personId);
  const store = getStore();
  const game = await store.get("card_games", chatId);
  const now = new Date().toISOString();
  const stale = game && typeof opts.at === "number" && opts.at !== game.position;

  if (action === "deck" || action === "shuffle") {
    const deck = deckById(action === "shuffle" ? game?.deck ?? "" : opts.deck ?? "");
    if (!deck) throw new DomainError("Choose a deck.");
    if (deck.plus && !(await chatHasPlus(chatId))) throw new DomainError(`${deck.name} comes with an Afriheart membership.`, 402);
    if (action === "shuffle" && stale) return view(chatId, game);
    const next: CardGame = { id: chatId, chat_id: chatId, deck: deck.id, seed: randomInt(1, 2 ** 31), position: 0, flipped: false, started_by: personId, updated_by: personId, updated_at: now };
    if (game) await store.update("card_games", chatId, next);
    else await store.insert("card_games", next);
    return view(chatId, next);
  }
  if (!game) throw new DomainError("Choose a deck first.");
  if (stale) return view(chatId, game);
  const total = deckById(game.deck)?.questions.length ?? 0;
  let patch: Partial<CardGame>;
  switch (action) {
    case "flip": patch = { flipped: true }; break;
    case "next": patch = { position: Math.min(game.position + 1, total), flipped: false }; break;
    case "back": patch = { position: Math.max(game.position - 1, 0), flipped: true }; break;
    default: throw new DomainError("Unknown move.");
  }
  if (action === "flip" && (game.flipped || game.position >= total)) return view(chatId, game);
  const updated = { ...game, ...patch, updated_by: personId, updated_at: now };
  await store.update("card_games", chatId, { ...patch, updated_by: personId, updated_at: now });
  return view(chatId, updated);
}
