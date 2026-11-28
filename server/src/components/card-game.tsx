"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { sendEncrypted } from "@/lib/e2e-device";
import { backupPoll, useLive } from "@/lib/live";
import { CARD_DECKS, deckById, type Deck, type DeckId } from "@/lib/card-decks";
import type { CardGameView } from "@/lib/cards";

/** A small drawing for the back of each deck's cards. */
function Motif({ deck, size = 56 }: { deck: DeckId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (deck) {
    case "thoughtful": // a crescent moon and two stars
      return <svg {...common}><path d="M30 8a16 16 0 1 0 10 28A13 13 0 0 1 30 8z" /><path d="M36 10l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1zM41 21l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></svg>;
    case "playful": // two dice
      return <svg {...common}><rect x="6" y="14" width="18" height="18" rx="4" transform="rotate(-12 15 23)" /><rect x="24" y="16" width="18" height="18" rx="4" transform="rotate(10 33 25)" /><circle cx="15" cy="23" r="1.6" fill="currentColor" /><circle cx="29" cy="21" r="1.6" fill="currentColor" /><circle cx="37" cy="29" r="1.6" fill="currentColor" /><circle cx="33" cy="25" r="1.6" fill="currentColor" /></svg>;
    case "flirty": // two hearts
      return <svg {...common}><path d="M19 38s-12-7-13.5-15A7 7 0 0 1 19 18a7 7 0 0 1 13.5 5C31 31 19 38 19 38z" /><path d="M33 20s5-3 6-6.5A3.6 3.6 0 0 0 33 11a3.6 3.6 0 0 0-6 2.5" /></svg>;
    case "future": // the sun coming up over a road
      return <svg {...common}><path d="M8 30h32M14 30a10 10 0 0 1 20 0" /><path d="M24 12v4M12 18l3 3M36 18l-3 3" /><path d="M21 34l-3 8M27 34l3 8" /></svg>;
  }
}

/**
 * Talking cards: a deck of questions you play together. Both phones see the same card, live,
 * so it works in a chat or on top of a voice or video call. Turns alternate, starting with
 * whoever chose the deck.
 */
export function CardGame({ chatId, meId, initial, compact = false, onDark = false }: {
  chatId: string; meId: string; initial?: CardGameView | null; compact?: boolean; onDark?: boolean;
}) {
  const [game, setGame] = useState<CardGameView | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  // Which card was last sent to the chat from this phone, so the button can say "Sent".
  const [sent, setSent] = useState<string | null>(null);
  const refresh = useCallback(() => apiGet<CardGameView>(`/api/chats/${chatId}/cards`).then(setGame, () => undefined), [chatId]);

  // The other person's moves arrive with a realtime nudge; a slow poll is the backup.
  const live = useLive((n) => { if (n.chat === chatId || n.resync) refresh(); });
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { if (document.visibilityState === "visible") refresh(); timer = setTimeout(tick, backupPoll(liveRef.current, 3000)); };
    timer = setTimeout(tick, initial ? 600 : 0);
    return () => clearTimeout(timer);
  }, [refresh, initial]);

  /** Put the card in the chat (end-to-end encrypted, like any message) so you can answer by text. */
  async function sendToChat() {
    if (!deck || !game?.question || busy) return;
    const key = `${deck.id}|${game.position}|${game.question}`;
    setBusy(true);
    setError(null);
    try {
      await sendEncrypted(chatId, meId, { t: "card", deck: deck.id, question: game.question });
      setSent(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the card. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function move(action: "deck" | "flip" | "next" | "back" | "shuffle", deck?: DeckId) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setGame(await apiSend<CardGameView>(`/api/chats/${chatId}/cards`, "POST", { action, deck, at: game?.position }));
      setChoosing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const muted = onDark ? "text-white/75" : "text-muted";
  const deck = game?.deck ? deckById(game.deck) : undefined;

  if (!game) return <p className={`py-6 text-center text-sm ${muted}`}>Shuffling…</p>;

  if (!deck || choosing) {
    return (
      <section aria-label="Choose a deck" className="flex flex-col gap-3">
        <p className={`text-sm ${muted}`}>{"Pick a deck. You'll take turns answering, and you'll both see the same card."}</p>
        <div className={`grid grid-cols-2 gap-2.5 ${compact ? "" : "sm:gap-3"}`}>
          {CARD_DECKS.map((d) => (
            <button key={d.id} onClick={() => move("deck", d.id)} disabled={busy}
              className={`relative flex flex-col items-start gap-1 rounded-2xl p-3 text-left shadow-sm transition-transform active:scale-[.98] ${compact ? "min-h-24" : "min-h-32"} ${game.deck === d.id ? "ring-2 ring-offset-2 ring-[color:var(--accent)]" : ""}`}
              style={{ background: d.bg, color: d.ink }}>
              <Motif deck={d.id} size={compact ? 28 : 36} />
              {d.plus && !game.plus && <span className="absolute right-2 top-2 rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold">Plus</span>}
              <span className="mt-auto text-base font-bold leading-tight">{d.name}</span>
              <span className="text-xs opacity-90">{d.blurb}<span className="sr-only">, {d.questions.length} cards</span></span>
            </button>
          ))}
        </div>
        {deck && <button className={`min-h-11 self-center text-sm font-semibold underline ${onDark ? "text-white" : "text-accent"}`} onClick={() => setChoosing(false)}>Keep playing {deck.name}</button>}
        {error && <p role="alert" className="text-sm text-danger">{error}{error.includes("membership") && <> <Link href="/plus" className="font-semibold underline">Get Afriheart+</Link></>}</p>}
        {!game.plus && <p className={`text-xs ${muted}`}>Flirty and Future us come with an Afriheart membership.</p>}
      </section>
    );
  }

  const done = game.position >= game.total;
  const myTurn = game.answerer?.id === meId;
  const turn = !game.answerer ? "" : myTurn ? "Your turn to answer" : `${game.answerer.name.split(" ")[0]} answers this one`;

  return (
    <section aria-label={`Talking cards: ${deck.name}`} className="flex flex-col gap-3" data-deck={deck.id} data-position={game.position} data-flipped={game.flipped}>
      <div className={`flex items-center justify-between text-sm ${muted}`}>
        <span>{done ? `${deck.name}: all ${game.total} cards played` : `${deck.name} · card ${game.position + 1} of ${game.total}`}</span>
        <button className={`min-h-11 px-1 font-semibold underline ${onDark ? "text-white" : "text-accent"}`} onClick={() => setChoosing(true)}>Change deck</button>
      </div>

      {done ? (
        <Card deck={deck} compact={compact} flipped>
          <p className="display text-2xl leading-snug">{"That's the whole deck!"}</p>
          <p className="mt-2 text-sm opacity-90">Shuffle and go again, or try another deck.</p>
        </Card>
      ) : (
        <Card deck={deck} compact={compact} flipped={game.flipped} onFlip={game.flipped ? undefined : () => move("flip")} busy={busy}>
          <p data-question className={`display leading-snug ${compact ? "text-xl" : "text-[26px]"}`}>{game.question}</p>
        </Card>
      )}

      {/* Read out the card when it's turned over, on either phone. */}
      <p className="sr-only" aria-live="polite">{game.flipped && game.question ? `${game.question} ${turn}.` : ""}</p>

      {!done && <p className={`text-center text-sm font-semibold ${onDark ? "text-white" : ""}`}>{turn}</p>}
      {!done && game.flipped && game.question && (
        sent === `${deck.id}|${game.position}|${game.question}`
          ? <p role="status" className={`text-center text-sm ${muted}`}>Sent to the chat. Answer it there whenever you like.</p>
          : <button className={`min-h-11 self-center text-sm font-semibold underline ${onDark ? "text-white" : "text-accent"}`} disabled={busy} onClick={sendToChat}>Send to chat</button>
      )}
      {error && <p role="alert" className="text-center text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        {done ? (
          <>
            <button className={`btn flex-1 ${onDark ? "!bg-white !text-[#0b2f2b] !border-white" : ""}`} disabled={busy} onClick={() => move("shuffle")}>Shuffle and play again</button>
            <button className={`btn btn-ghost flex-1 ${onDark ? "!text-white !border-white/40" : ""}`} onClick={() => setChoosing(true)}>Another deck</button>
          </>
        ) : (
          <>
            <button className={`btn btn-ghost ${onDark ? "!text-white !border-white/40" : ""}`} disabled={busy || game.position === 0} onClick={() => move("back")}>Back</button>
            {game.flipped
              ? <button className={`btn flex-1 ${onDark ? "!bg-white !text-[#0b2f2b] !border-white" : ""}`} disabled={busy} onClick={() => move("next")}>Next card</button>
              : <button className={`btn flex-1 ${onDark ? "!bg-white !text-[#0b2f2b] !border-white" : ""}`} disabled={busy} onClick={() => move("flip")}>Turn over</button>}
          </>
        )}
      </div>
    </section>
  );
}

/** One card: the patterned back until it's turned over, then the question. */
function Card({ deck, compact, flipped, onFlip, busy, children }: {
  deck: Deck; compact: boolean; flipped: boolean; onFlip?: () => void; busy?: boolean; children: React.ReactNode;
}) {
  const size = compact ? "h-48" : "aspect-[5/6] max-h-[46dvh] w-full";
  const face = "absolute inset-0 flex flex-col items-center justify-center rounded-3xl px-6 py-5 text-center backface-hidden";
  const inner = (
    <div className={`relative ${size} w-full transition-transform duration-500 transform-3d motion-reduce:transition-none ${flipped ? "rotate-y-180" : ""}`}>
      <div className={face} style={{ background: deck.bg, color: deck.ink }} aria-hidden={flipped}>
        <Motif deck={deck.id} size={compact ? 48 : 72} />
        <p className="mt-3 text-xs font-bold uppercase tracking-[.25em]">Talking cards</p>
        <p className="display mt-1 text-2xl">{deck.name}</p>
        <p className="mt-3 text-sm opacity-90">Tap to turn over</p>
      </div>
      <div className={`${face} rotate-y-180 shadow-sm`} style={{ background: deck.bg, color: deck.ink }} aria-hidden={!flipped}>
        <div className="flex flex-1 flex-col items-center justify-center">{flipped ? children : null}</div>
        <p className="text-[11px] font-bold uppercase tracking-[.25em] opacity-90">{deck.name}</p>
      </div>
    </div>
  );
  return (
    <div className="perspective-distant">
      {onFlip
        ? <button className="block w-full rounded-3xl" onClick={onFlip} disabled={busy}>{inner}</button>
        : inner}
    </div>
  );
}
