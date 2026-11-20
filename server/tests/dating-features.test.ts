import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "feat-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
process.env.LOCAL_MEDIA_DIR = path.join(dir, "media");

const { getStore } = await import("@/lib/store");
const { findOrCreatePerson } = await import("@/lib/domain");
const dating = await import("@/lib/dating");
const media = await import("@/lib/media");
const double = await import("@/lib/double");
const weMet = await import("@/lib/we-met");

let n = 0;
async function person(name: string, gender: "woman" | "man", seeking: ("women" | "men")[], extra: Record<string, unknown> = {}) {
  const id = (await findOrCreatePerson({ name, phone: `2782555${String(1000 + n++)}`, isGuest: false })).id;
  const photo = await media.saveOwnedMedia(id, "profile", "profiles", new Uint8Array(2000).fill(n), "image/jpeg");
  await dating.saveProfile(id, {
    display_name: name, birthdate: "1995-05-05", gender, interested_in: seeking, age_min: 18, age_max: 60, area: "", bio: "",
    photos: [photo], date_idea: "Sunset walk", paused: false, consent: true, ...extra,
  });
  return id;
}

describe("prompts and comment-to-like", () => {
  let her: string, him: string;
  beforeAll(async () => {
    her = await person("Ayesha", "woman", ["men"], { prompts: [{ id: "sunday", answer: "Market, then a long nap" }, { id: "nonsense", answer: "x" }, { id: "sunday", answer: "dupe" }] });
    him = await person("Sipho", "man", ["women"]);
  });

  it("keeps up to three valid prompts, once each", async () => {
    const p = await dating.getProfile(her);
    expect(p?.prompts).toEqual([{ id: "sunday", answer: "Market, then a long nap" }]);
    const card = (await dating.discover(him)).find((c) => c.id === her)!;
    expect(card.prompts[0]).toEqual({ id: "sunday", text: "My ideal Sunday", answer: "Market, then a long nap" });
  });

  it("likes a specific prompt with a comment, which she sees, then opens the match chat", async () => {
    await expect(dating.swipe(him, her, "like", "prompt:dealbreaker", "hi")).rejects.toThrow(/changed/);
    await dating.swipe(him, her, "like", "prompt:sunday", "  Which market?   I'm a Sunday market person too ");
    const seen = (await dating.discover(her)).find((c) => c.id === him)!;
    expect(seen.liked_you).toEqual({ label: 'your answer to "My ideal Sunday"', comment: "Which market? I'm a Sunday market person too" });
    const { match } = await dating.swipe(her, him, "like");
    const like = (await getStore().list("messages", { chat_id: match!.chat_id })).find((m) => m.kind === "like")!;
    expect(JSON.parse(like.body)).toEqual({ by: "Sipho", label: "Ayesha's answer to \"My ideal Sunday\"", quote: "Market, then a long nap", comment: "Which market? I'm a Sunday market person too" });
  });
});

describe("today's most compatible", () => {
  it("picks the highest match % once a day and puts it first", async () => {
    const ans = (a: string, imp: 0 | 1 | 2 | 3 = 3) => ({ a, ok: [a], imp });
    const set = { looking: ans("long"), kids: ans("want"), smoke: ans("never"), drink: ans("social"), texting: ans("few"), pets: ans("dogs") };
    const me = await person("Lerato", "woman", ["men"]);
    const best = await person("Thabo", "man", ["women"]);
    const ok = await person("Kyle", "man", ["women"]);
    await getStore().update("dating_profiles", me, { answers: set });
    await getStore().update("dating_profiles", best, { answers: set });
    await getStore().update("dating_profiles", ok, { answers: { ...set, kids: ans("dont"), smoke: ans("often") } });
    const first = await dating.discover(me);
    expect(first[0].id).toBe(best);
    expect(first[0].daily_pick).toBe(true);
    expect(first.filter((c) => c.daily_pick).length).toBe(1);
    await dating.swipe(me, best, "pass");
    const after = await dating.discover(me);
    expect(after.some((c) => c.daily_pick)).toBe(false); // one pick a day, even if you pass
  });
});

describe("double dates", () => {
  it("pairs friends by invite, shows pairs that fit both ways, and opens a chat for four on a mutual like", async () => {
    const amy = await person("Amy", "woman", ["men"]);
    const bea = await person("Bea", "woman", ["men"]);
    const cal = await person("Cal", "man", ["women"]);
    const dan = await person("Dan", "man", ["women"]);
    const eve = await person("Eve", "woman", ["women"]); // only into women
    const fay = await person("Fay", "woman", ["women"]);

    const d1 = await double.createDuo(amy, "Bowling, then burgers");
    await expect(double.joinDuo(amy, d1.code)).rejects.toThrow(/own invite/);
    await double.joinDuo(bea, d1.code);
    await expect(double.joinDuo(cal, d1.code)).rejects.toThrow(/expired/); // codes are single use
    const d2 = await double.createDuo(cal, "Karaoke night");
    await double.joinDuo(dan, d2.code);
    const d3 = await double.createDuo(eve, "Picnic");
    await double.joinDuo(fay, d3.code);

    const seen = await double.discoverDuos(amy);
    expect(seen.map((c) => c.people.map((p) => p.name).sort().join("+"))).toEqual(["Cal+Dan"]); // Eve & Fay don't fit
    expect(await dating.canSeePhoto(amy, seen[0].people[0].photo)).toBe(true);

    expect((await double.swipeDuo(bea, d2.id, "like")).match).toBeNull(); // one like counts for the pair
    const { match } = await double.swipeDuo(dan, d1.id, "like");
    expect(match?.title).toMatch(/Double date/);
    const members = await getStore().list("chat_members", { chat_id: match!.chat_id });
    expect(members.map((m) => m.person_id).sort()).toEqual([amy, bea, cal, dan].sort());
    const chat = await getStore().get("chats", match!.chat_id);
    expect(chat?.origin).toBe("double");
    const { thread } = await import("@/lib/chat");
    const t = await thread(match!.chat_id, amy);
    expect(t.members.filter((m) => m.id !== amy).every((m) => m.phone === "")).toBe(true); // numbers hidden
    expect(t.messages.some((m) => m.kind === "plan")).toBe(true);
  });
});

describe("we met", () => {
  it("asks after a planned date, keeps answers private, and flags 'not like their photos' to the team", async () => {
    const her = await person("Nandi", "woman", ["men"]);
    const him = await person("Zola", "man", ["women"]);
    await dating.swipe(her, him, "like");
    const { match } = await dating.swipe(him, her, "like");
    const chatId = match!.chat_id;
    expect(await weMet.weMetAsk(chatId, her)).toBeNull(); // no date yet
    await getStore().insert("az_dates", {
      id: "11111111-2222-4333-8444-555555555555", chat_id: chatId, letter: "A", activity: "Aquarium", status: "done", plan_slug: null,
      message_id: null, story_message_id: null, done_at: new Date().toISOString(), updated_by: her, updated_at: new Date().toISOString(),
    });
    expect((await weMet.weMetAsk(chatId, her))?.name).toBe("Zola");
    await weMet.answerWeMet(chatId, her, { met: true, again: "yes", as_pictured: false });
    expect(await weMet.weMetAsk(chatId, her)).toBeNull(); // asked once
    const reports = await getStore().list("reports", { reported: him, reason: "fake" });
    expect(reports.length).toBe(1);
    expect(await dating.isBlockedBetween(her, him)).toBe(false); // a check, not a block
    await weMet.answerWeMet(chatId, him, { met: null });
    expect(await weMet.weMetAsk(chatId, him)).toBeNull(); // "not yet": asked again in a few days
    expect((await weMet.weMetStats()).met).toBe(1);
  });
});
