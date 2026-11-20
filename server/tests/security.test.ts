import { beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { safeNext } from "@/lib/safe-next";

const dir = mkdtempSync(path.join(tmpdir(), "sec-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
process.env.LOCAL_MEDIA_DIR = path.join(dir, "media");

// A fake cookie jar so the session code can run outside Next.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => { jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
  }),
}));

const { getStore } = await import("@/lib/store");
const { findOrCreatePerson } = await import("@/lib/domain");
const session = await import("@/lib/session");
const dating = await import("@/lib/dating");
const media = await import("@/lib/media");
const { limit } = await import("@/lib/rate-limit");
const { deleteAccount } = await import("@/lib/account");

describe("redirect after sign-in", () => {
  it("only allows paths on this site", () => {
    expect(safeNext("/discover")).toBe("/discover");
    expect(safeNext("/p/abc?x=1#y")).toBe("/p/abc?x=1#y");
    for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "javascript:alert(1)", "/%0d%0aLocation:x", " /x", "/\tevil", ""]) {
      expect(safeNext(bad, "/"), bad).toBe(bad === "/%0d%0aLocation:x" ? "/%0d%0aLocation:x" : "/");
    }
  });
});

describe("sessions", () => {
  let a: string;
  beforeAll(async () => { a = (await findOrCreatePerson({ name: "Ayesha", phone: "27825550201", isGuest: false })).id; });

  it("stores only a hash of the token and ends it on sign-out", async () => {
    await session.setSession(a, "Test phone");
    const token = jar.get("common_session")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await session.getSessionPersonId()).toBe(a);
    const rows = await getStore().list("sessions", { person_id: a });
    expect(rows.some((r) => r.id === token)).toBe(false); // never the raw token
    await session.clearSession();
    jar.set("common_session", token); // someone copied the cookie earlier
    expect(await session.getSessionPersonId()).toBeNull();
  });

  it("removing a device or signing out everywhere ends those sessions", async () => {
    await session.setSession(a);
    const phone1 = jar.get("common_session")!;
    await session.linkSessionToDevice("dev-1");
    await session.setSession(a);
    const phone2 = jar.get("common_session")!;
    await session.revokeSessions(a, { deviceId: "dev-1" });
    jar.set("common_session", phone1);
    expect(await session.getSessionPersonId()).toBeNull();
    jar.set("common_session", phone2);
    expect(await session.getSessionPersonId()).toBe(a);
    await session.revokeSessions(a);
    expect(await session.getSessionPersonId()).toBeNull();
  });

  it("rejects old-style and malformed cookies", async () => {
    jar.set("common_session", `${a}.signature`);
    expect(await session.getSessionPersonId()).toBeNull();
  });
});

describe("rate limits", () => {
  it("refuses once the window's limit is reached", async () => {
    for (let i = 0; i < 10; i++) await limit("report", "tester");
    await expect(limit("report", "tester")).rejects.toThrow(/lot of reports/);
    await expect(limit("report", "someone-else")).resolves.toBeUndefined();
  });
});

describe("profiles, photos and removal", () => {
  let her: string, him: string;
  const photo = async (owner: string) => media.saveOwnedMedia(owner, "profile", "profiles", new Uint8Array(3000).fill(1), "image/jpeg");
  const input = (photos: string[]) => ({
    display_name: "X", birthdate: "1995-05-05", gender: "woman", interested_in: ["men"], age_min: 18, age_max: 60, area: "", bio: "",
    photos, date_idea: "Sunset walk", paused: false, consent: true,
  });
  beforeAll(async () => {
    her = (await findOrCreatePerson({ name: "Her", phone: "27825550202", isGuest: false })).id;
    him = (await findOrCreatePerson({ name: "Him", phone: "27835550203", isGuest: false })).id;
  });

  it("only lets you use photos you uploaded", async () => {
    const mine = await photo(her);
    const his = await photo(him);
    const saved = await dating.saveProfile(her, input([mine, his]));
    expect(saved.photos).toEqual([mine]);
    await expect(dating.saveProfile(him, { ...input([mine]), gender: "man", interested_in: ["women"] })).rejects.toThrow(/at least one photo/);
  });

  it("drops the verified badge when a new photo is added, keeps it when one is removed", async () => {
    const p1 = await photo(her);
    const p2 = await photo(her);
    await dating.saveProfile(her, input([p1, p2]));
    await getStore().update("dating_profiles", her, { verified_at: "2026-11-18T00:00:00Z", verified_only: true });
    const fewer = await dating.saveProfile(her, { ...input([p1]), verified_only: true });
    expect(fewer.verified_at).toBeTruthy();
    expect(existsSync(path.join(dir, "media", p2))).toBe(false); // removed photo deleted from storage
    const p3 = await photo(her);
    const swapped = await dating.saveProfile(her, { ...input([p3]), verified_only: true });
    expect(swapped.verified_at).toBeNull();
    expect(swapped.verified_only).toBe(false);
  });

  it("finds a photo's owner without loading every profile", async () => {
    const spy = vi.spyOn(getStore(), "listContaining");
    const me = await dating.getProfile(her);
    expect(await dating.canSeePhoto(her, me!.photos[0])).toBe(true);
    expect(spy).toHaveBeenCalledWith("dating_profiles", "photos", me!.photos[0]); // an indexed lookup on Supabase
    spy.mockRestore();
  });

  it("ends a removed person's matches so they can't message or call", async () => {
    const hp = await photo(him);
    await dating.saveProfile(him, { ...input([hp]), gender: "man", interested_in: ["women"] });
    await dating.swipe(her, him, "like");
    const { match } = await dating.swipe(him, her, "like");
    expect(match).toBeTruthy();
    await dating.endMatchesFor(him, "team", "This match has ended.");
    expect(await getStore().list("chat_members", { chat_id: match!.chat_id, person_id: him })).toEqual([]);
    expect((await getStore().list("chat_members", { chat_id: match!.chat_id, person_id: her })).length).toBe(1);
    const { sendEncrypted } = await import("@/lib/devices");
    await expect(sendEncrypted(match!.chat_id, him, "{}")).rejects.toThrow();
  });
});

describe("deleting an account", () => {
  it("removes profile, photos, sessions and what they sent, leaving an anonymous placeholder", async () => {
    const p = (await findOrCreatePerson({ name: "Leaving Person", phone: "27845550204", isGuest: false })).id;
    const f = await media.saveOwnedMedia(p, "profile", "profiles", new Uint8Array(3000).fill(2), "image/jpeg");
    await dating.saveProfile(p, {
      display_name: "Leaving", birthdate: "1990-01-01", gender: "man", interested_in: ["women"], age_min: 18, age_max: 60, area: "", bio: "secret bio",
      photos: [f], date_idea: "Coffee", paused: false, consent: true,
    });
    await session.setSession(p);
    const store = getStore();
    await store.insert("messages", {
      id: "11111111-1111-4111-8111-111111111111", chat_id: "c1", sender_id: p, kind: "encrypted", body: "", media_path: null, media_ms: null,
      plan_id: null, call_id: null, cipher: "{\"sealed\":1}", awaiting: [], created_at: new Date().toISOString(), updated_at: null,
    });
    await deleteAccount(p);
    expect(await dating.getProfile(p)).toBeNull();
    expect(existsSync(path.join(dir, "media", f))).toBe(false);
    expect(await store.list("sessions", { person_id: p })).toEqual([]);
    expect(await store.list("media_files", { owner_id: p })).toEqual([]);
    const msg = await store.get("messages", "11111111-1111-4111-8111-111111111111");
    expect(msg?.cipher).toBeNull();
    const person = await store.get("people", p);
    expect(person?.name).toBe("Deleted account");
    expect(person?.phone).not.toBe("27845550204");
    expect(JSON.stringify(await store.list("dating_profiles"))).not.toContain("secret bio");
  });
});
