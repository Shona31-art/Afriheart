import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "cards-")), "db.json");
const { findOrCreatePerson } = await import("@/lib/domain");
const chat = await import("@/lib/chat");
const { cardGame, playCards } = await import("@/lib/cards");
const { CARD_DECKS, dealOrder } = await import("@/lib/card-decks");
const { hub } = await import("@/lib/realtime");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function couple(n: number) {
  const a = (await findOrCreatePerson({ name: "Lwazi Dlamini", phone: `2782555${n}01`, isGuest: false })).id;
  const b = (await findOrCreatePerson({ name: "Thabo Nkosi", phone: `2783555${n}02`, isGuest: false })).id;
  const room = await chat.openDirectChat(a, `083555${n}02`);
  return { a, b, room: room.id };
}

describe("talking cards decks", () => {
  it("has four decks of 30 different questions each", () => {
    expect(CARD_DECKS.map((d) => d.id)).toEqual(["thoughtful", "playful", "flirty", "future"]);
    for (const d of CARD_DECKS) {
      expect(d.questions).toHaveLength(30);
      expect(new Set(d.questions).size).toBe(30);
      for (const q of d.questions) expect(q.length).toBeLessThan(110);
    }
  });
  it("deals every card exactly once, the same way for the same seed", () => {
    const o = dealOrder(12345, 30);
    expect([...o].sort((x, y) => x - y)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(dealOrder(12345, 30)).toEqual(o);
    expect(dealOrder(54321, 30)).not.toEqual(o);
  });
});

describe("playing talking cards", () => {
  it("shares one card between both people, keeps the question hidden until it's turned over, and alternates turns", async () => {
    const { a, b, room } = await couple(71);
    expect((await cardGame(room, a)).deck).toBeNull();

    const dealt = await playCards(room, a, "deck", { deck: "thoughtful" });
    expect(dealt).toMatchObject({ deck: "thoughtful", position: 0, total: 30, flipped: false, question: null });
    expect(dealt.answerer?.id).toBe(a); // whoever chose the deck answers first

    const flipped = await playCards(room, b, "flip", { at: 0 });
    expect(flipped.flipped).toBe(true);
    expect(CARD_DECKS[0].questions).toContain(flipped.question);
    expect((await cardGame(room, a)).question).toBe(flipped.question); // same card on both phones

    const next = await playCards(room, a, "next", { at: 0 });
    expect(next).toMatchObject({ position: 1, flipped: false, question: null });
    expect(next.answerer?.id).toBe(b);

    const back = await playCards(room, a, "back", { at: 1 });
    expect(back).toMatchObject({ position: 0, flipped: true, question: flipped.question });
  });

  it("ignores a second tap on Next from the other phone, so no card is skipped", async () => {
    const { a, b, room } = await couple(72);
    await playCards(room, a, "deck", { deck: "playful" });
    await playCards(room, a, "flip", { at: 0 });
    const first = await playCards(room, a, "next", { at: 0 });
    const second = await playCards(room, b, "next", { at: 0 });
    expect(first.position).toBe(1);
    expect(second.position).toBe(1);
  });

  it("says when the deck is finished and can shuffle again", async () => {
    const { a, room } = await couple(73);
    await playCards(room, a, "deck", { deck: "playful" });
    let v = await cardGame(room, a);
    const seen = new Set<string>();
    while (v.position < v.total) {
      v = await playCards(room, a, "flip", { at: v.position });
      seen.add(v.question!);
      v = await playCards(room, a, "next", { at: v.position });
    }
    expect(seen.size).toBe(30);
    expect(v).toMatchObject({ position: 30, question: null, answerer: null });
    const again = await playCards(room, a, "shuffle", { at: 30 });
    expect(again).toMatchObject({ deck: "playful", position: 0, flipped: false });
  });

  it("is only for people in the chat, and nudges both phones on every move", async () => {
    const { a, b, room } = await couple(74);
    const outsider = (await findOrCreatePerson({ name: "Craig", phone: "27845557499", isGuest: false })).id;
    await expect(cardGame(room, outsider)).rejects.toThrow();
    await expect(playCards(room, outsider, "deck", { deck: "playful" })).rejects.toThrow();
    await expect(playCards(room, a, "deck", { deck: "nope" })).rejects.toThrow("Choose a deck.");
    await wait(80);
    const got: unknown[] = [];
    const off = hub().subscribe(b, (n) => got.push(n));
    await playCards(room, a, "deck", { deck: "thoughtful" });
    await wait(80);
    off();
    expect(got).toContainEqual({ chat: room });
  });
});
