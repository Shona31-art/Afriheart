import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "member-")), "db.json");
const { findOrCreatePerson } = await import("@/lib/domain");
const { getStore } = await import("@/lib/store");
const { gate, isFreePath } = await import("@/lib/membership");

let n = 0;
async function signedIn() {
  const id = (await findOrCreatePerson({ name: "P", phone: `2786${String(1110000 + ++n).padStart(7, "0")}`, isGuest: false })).id;
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await getStore().insert("sessions", {
    id: createHash("sha256").update(token).digest("hex"), person_id: id, device_id: null, user_agent: "",
    created_at: now.toISOString(), last_seen_at: now.toISOString(), expires_at: new Date(Date.now() + 86400_000).toISOString(), revoked_at: null,
  });
  return { id, cookies: { get: (name: string) => (name === "common_session" ? { value: token } : undefined) } };
}
const member = (id: string, days: number) =>
  getStore().insert("memberships", { id, person_id: id, plus_until: new Date(Date.now() + days * 86400_000).toISOString(), trial_until: null, updated_at: new Date().toISOString() });
const profile = (id: string) => getStore().insert("dating_profiles", { id, person_id: id } as never);
const none = { get: () => undefined };

afterEach(() => { delete process.env.PAID_APP; delete process.env.SUPER_ADMIN_PHONES; });

describe("Afriheart is a paid app", () => {
  it("keeps safety, support, account and paying open to everyone", () => {
    for (const p of ["/signin", "/plus", "/plus/test-checkout", "/you", "/support", "/support/abc", "/privacy", "/terms",
      "/dating/profile", "/dating/safety", "/dating/verify", "/api/plus/checkout", "/api/account", "/api/support",
      "/api/dating/report", "/api/dating/block", "/api/dating/unmatch", "/api/dating/profile", "/vouch/xyz", "/quiz/abc"]) {
      expect(isFreePath(p), p).toBe(true);
    }
    for (const p of ["/", "/discover", "/chats/1", "/plans", "/dating/likes", "/status", "/api/dating/discover", "/api/dating/swipe", "/api/chats/1/messages", "/api/calls"]) {
      expect(isFreePath(p), p).toBe(false);
    }
  });

  it("lets members and signed-out visitors through", async () => {
    expect(await gate("/discover", none)).toEqual({ allow: true });
    const a = await signedIn();
    await member(a.id, 3);
    expect(await gate("/discover", a.cookies)).toEqual({ allow: true });
  });

  it("sends people with no profile yet to make one (that's where the free trial starts)", async () => {
    const b = await signedIn();
    expect(await gate("/discover", b.cookies)).toEqual({ allow: false, api: false, to: "/dating/profile" });
  });

  it("locks everything else once the trial or membership has ended", async () => {
    const c = await signedIn();
    await profile(c.id);
    await member(c.id, -1);
    expect(await gate("/", c.cookies)).toEqual({ allow: false, api: false, to: "/plus?locked=1" });
    expect(await gate("/api/dating/swipe", c.cookies)).toMatchObject({ allow: false, api: true });
    expect(await gate("/api/dating/report", c.cookies)).toEqual({ allow: true });
    expect(await gate("/plus", c.cookies)).toEqual({ allow: true });
  });

  it("never locks out the Afriheart team, and can be switched off", async () => {
    const d = await signedIn();
    await profile(d.id);
    const phone = (await getStore().get("people", d.id))!.phone;
    process.env.SUPER_ADMIN_PHONES = phone;
    expect(await gate("/discover", d.cookies)).toEqual({ allow: true });
    delete process.env.SUPER_ADMIN_PHONES;
    expect((await gate("/discover", d.cookies)).allow).toBe(false);
    process.env.PAID_APP = "off";
    expect(await gate("/discover", d.cookies)).toEqual({ allow: true });
  });
});
