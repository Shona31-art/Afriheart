import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "boost-")), "db.json");
process.env.LOCAL_MEDIA_DIR = mkdtempSync(path.join(tmpdir(), "boost-media-"));
const { findOrCreatePerson } = await import("@/lib/domain");
const { getStore } = await import("@/lib/store");
const dating = await import("@/lib/dating");
const plus = await import("@/lib/plus");
const media = await import("@/lib/media");

let n = 0;
const person = async (name: string) => (await findOrCreatePerson({ name, phone: `2783${String(4440000 + ++n).padStart(7, "0")}`, isGuest: false })).id;
const profile = async (id: string, gender: "woman" | "man", wants: "men" | "women") => {
  const photo = await media.saveOwnedMedia(id, "profile", "profiles", new Uint8Array(3000).fill(1), "image/jpeg");
  return dating.saveProfile(id, {
    display_name: "P" + n, birthdate: "1995-05-05", gender, interested_in: [wants], age_min: 18, age_max: 60, area: "", bio: "",
    photos: [photo], date_idea: "Sunset walk on the promenade", paused: false, consent: true,
  } as never);
};
const noPlus = async (id: string) => getStore().update("memberships", id, { plus_until: new Date(Date.now() - 1000).toISOString() });

afterEach(() => { delete process.env.FOUNDING_MEMBERS; delete process.env.FOUNDING_DAYS; });

describe("Afriheart+ boost", () => {
  it("puts a boosted person first in Discover, for 30 minutes, once a day", async () => {
    const viewer = await person("Viewer");
    await profile(viewer, "woman", "men");
    const others = [];
    for (let i = 0; i < 4; i++) { const id = await person("Man" + i); await profile(id, "man", "women"); others.push(id); }
    const booster = others[3];
    await noPlus(booster);
    await expect(dating.startBoost(booster)).rejects.toThrow("comes with an Afriheart membership");
    await getStore().update("memberships", booster, { plus_until: new Date(Date.now() + 86400_000).toISOString() });
    const on = await dating.startBoost(booster);
    expect(on.active_until).not.toBeNull();
    const cards = await dating.discover(viewer);
    const first = cards[0].daily_pick ? cards[1] : cards[0];
    expect(first.id).toBe(booster);
    // Already boosted: no second boost until tomorrow.
    await getStore().update("dating_profiles", booster, { boosted_until: new Date(Date.now() - 60_000).toISOString() });
    const after = await dating.boostState(booster);
    expect(after.active_until).toBeNull();
    expect(after.next_at).not.toBeNull();
    await expect(dating.startBoost(booster)).rejects.toThrow("used today's boost");
  });
});

describe("Afriheart+ undo", () => {
  it("brings back the last person you passed on, only with Afriheart+", async () => {
    const me = await person("Me");
    await profile(me, "woman", "men");
    const him = await person("Him");
    await profile(him, "man", "women");
    await dating.swipe(me, him, "pass");
    await noPlus(me);
    await expect(dating.undoPass(me)).rejects.toThrow("comes with an Afriheart membership");
    await getStore().update("memberships", me, { plus_until: new Date(Date.now() + 86400_000).toISOString() });
    const back = await dating.undoPass(me);
    expect(back.id).toBe(him);
    expect((await dating.discover(me)).map((c) => c.id)).toContain(him);
    await expect(dating.undoPass(me)).rejects.toThrow("no pass to undo");
    await dating.swipe(me, him, "like");
    await expect(dating.undoPass(me)).rejects.toThrow("no pass to undo"); // likes can't be undone
  });
});

describe("founding members", () => {
  it("gives the first people a longer free trial, then the normal week", async () => {
    process.env.FOUNDING_MEMBERS = String(((await getStore().list("memberships")).filter((m) => m.founding).length) + 1);
    process.env.FOUNDING_DAYS = "90";
    const first = await person("First");
    expect((await plus.trialState(first)).founding).toBe(true);
    expect((await plus.trialState(first)).founding_left).toBe(1);
    await profile(first, "woman", "men"); // the trial starts with the first profile
    const m1 = await getStore().get("memberships", first);
    expect(m1?.founding).toBe(true);
    expect(Math.round((Date.parse(m1!.trial_until!) - Date.now()) / 86400_000)).toBe(90);
    expect((await plus.trialState(first)).founding_left).toBe(0);

    const second = await person("Second");
    expect((await plus.trialState(second)).founding).toBe(false);
    await profile(second, "woman", "men");
    const m2 = await getStore().get("memberships", second);
    expect(m2?.founding).toBeFalsy();
    expect(Math.round((Date.parse(m2!.trial_until!) - Date.now()) / 86400_000)).toBe(7);
  });

  it("is off unless FOUNDING_MEMBERS is set", async () => {
    expect(plus.foundingConfig()).toBeNull();
    expect(await plus.foundingLeft()).toBeNull();
  });
});
