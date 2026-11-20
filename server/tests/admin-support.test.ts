import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "admin-")), "db.json");
process.env.SUPER_ADMIN_PHONES = "0825550001";
process.env.TEAM_PHONES = "0825550002";
process.env.ALLOW_TEST_PAYMENTS = "yes-insecure";
const { findOrCreatePerson } = await import("@/lib/domain");
const admin = await import("@/lib/admin");
const support = await import("@/lib/support");
const plus = await import("@/lib/plus");
const { getStore } = await import("@/lib/store");

const make = async (name: string, phone: string) => (await findOrCreatePerson({ name, phone, isGuest: false })).id;
const boss = await make("Boss", "27825550001");
const mod = await make("Mo Moderator", "27825550002");
const helper = await make("Hope Helper", "27825550003");
const user = await make("Una User", "27825550004");

describe("roles", () => {
  it("come from the server settings and the team list, and limit what each can do", async () => {
    expect(await admin.staffRole(boss)).toBe("super_admin");
    expect(await admin.staffRole(mod)).toBe("moderator");
    expect(await admin.staffRole(user)).toBeNull();
    await expect(admin.dashboard(user)).rejects.toThrow(/only for the Afriheart team/);
    await admin.setStaff(boss, "0825550003", "support");
    expect(await admin.staffRole(helper)).toBe("support");
    await expect(admin.grantPlus(helper, user, 7, "")).rejects.toThrow(/can't do that/);
    await expect(admin.banPerson(helper, user, "spam")).rejects.toThrow(/can't do that/);
    await expect(admin.setStaff(mod, "0825550004", "super_admin")).rejects.toThrow(/can't do that/);
    await expect(admin.setStaff(boss, "0825550001", null)).rejects.toThrow(/server settings/);
    // Support sees numbers partly hidden.
    const found = await admin.searchPeople(helper, "Una");
    expect(found[0].phone).toContain("•");
    expect((await admin.searchPeople(boss, "0825550004"))[0].phone).toBe("27825550004");
  });
});

describe("people", () => {
  it("bans sign people out and keep them out, and every action is logged", async () => {
    const victim = await make("Vusi Spammer", "27825550010");
    await getStore().insert("sessions", { id: "s-victim", person_id: victim, device_id: null, user_agent: "", created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400_000).toISOString(), revoked_at: null });
    await expect(admin.banPerson(mod, victim, "")).rejects.toThrow(/Say why/);
    await admin.banPerson(mod, victim, "Scam messages");
    expect((await getStore().get("sessions", "s-victim"))!.revoked_at).not.toBeNull();
    expect((await getStore().get("people", victim))!.banned_at).not.toBeNull();
    expect(await admin.staffRole(victim)).toBeNull();
    await expect(admin.banPerson(mod, boss, "nope")).rejects.toThrow(/Super admins/);
    await admin.unbanPerson(mod, victim);
    expect((await getStore().get("people", victim))!.banned_at).toBeNull();
    const log = await admin.auditLog(boss);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["ban", "unban", "set_staff"]));
    expect(log.find((l) => l.action === "ban")!.details).toBe("Scam messages");
  });

  it("gifts and refunds change Afriheart+ days", async () => {
    const p = await make("Pam Payer", "27825550011");
    const { until } = await admin.grantPlus(boss, p, 7, "Sorry for the trouble");
    expect(Date.parse(until) - Date.now()).toBeGreaterThan(6.9 * 86400_000);
    const pay = await plus.startCheckout(p, "month", "https://x.example");
    await plus.testCheckout(p, pay.id, "pay");
    const before = Date.parse((await getStore().get("memberships", p))!.plus_until);
    await admin.refundPayment(boss, pay.id, "Payfast refund 123");
    const after = Date.parse((await getStore().get("memberships", p))!.plus_until);
    expect(Math.round((before - after) / 86400_000)).toBe(30);
    expect((await getStore().get("payments", pay.id))!.status).toBe("refunded");
    await expect(admin.refundPayment(boss, pay.id, "again")).rejects.toThrow(/Only completed/);
    // A refunded payment is not revenue.
    expect((await admin.dashboard(boss)).plus.revenue_total_cents).toBe(0);
  });

  it("deleting an account needs the exact name", async () => {
    const d = await make("Dee Delete", "27825550012");
    await expect(admin.adminDeleteAccount(boss, d, "dee")).rejects.toThrow(/exactly/);
    await admin.adminDeleteAccount(boss, d, "Dee Delete");
    expect((await getStore().get("people", d))!.name).toBe("Deleted account");
  });
});

describe("announcements", () => {
  it("show one banner at a time, and end", async () => {
    await admin.postAnnouncement(boss, "Calls may drop tonight", "warning", 2);
    await admin.postAnnouncement(boss, "New stickers are here!", "info", null);
    const a = await admin.activeAnnouncement();
    expect(a?.text).toBe("New stickers are here!");
    await admin.endAnnouncement(boss, a!.id);
    expect(await admin.activeAnnouncement()).toBeNull();
    await expect(admin.postAnnouncement(mod, "Hello everyone", "info", null)).rejects.toThrow(/can't do that/);
  });
});

describe("support", () => {
  it("takes requests signed in or out, puts safety first, and keeps replies between the person and the team", async () => {
    await expect(support.createTicket(null, { category: "sign_in", body: "No code arrives on my phone" })).rejects.toThrow(/name/);
    await expect(support.createTicket(null, { category: "sign_in", name: "Gogo", body: "No code arrives on my phone" })).rejects.toThrow(/mobile number/);
    const anon = await support.createTicket(null, { category: "sign_in", name: "Gogo", phone: "083 555 0099", body: "No code arrives on my phone", include_device: true, device_info: "Browser: test" });
    const mine = await support.createTicket(user, { category: "payments", body: "I paid but Plus isn't on yet.", include_device: false, device_info: "secret" });
    const urgent = await support.createTicket(user, { category: "safety", body: "Someone threatened me after a date." });
    await expect(support.createTicket(user, { body: "short" })).rejects.toThrow(/more/);

    const inbox = await support.inbox(helper, "open");
    expect(inbox[0].id).toBe(urgent.id);
    expect(inbox.find((t) => t.id === anon.id)!.signed_in).toBe(false);
    await expect(support.inbox(user, "open")).rejects.toThrow();

    // Device details only when the person agreed.
    expect((await support.thread(helper, mine.id, true)).ticket.device_info).toBeNull();
    expect((await support.thread(helper, anon.id, true)).ticket.device_info).toBe("Browser: test");

    await support.reply(helper, mine.id, "Thanks! It's on now.", true);
    expect(await support.unreadSupport(user)).toBe(1);
    const t = await support.thread(user, mine.id, false);
    expect(t.messages.at(-1)!.author).toBe("Hope from Afriheart support");
    expect("contact_phone" in t.ticket).toBe(false);
    expect(await support.unreadSupport(user)).toBe(0);
    const other = await make("Nosy Neighbour", "27825550013");
    await expect(support.thread(other, mine.id, false)).rejects.toThrow(/Not found/);

    await support.setTicket(helper, mine.id, { status: "resolved" });
    await support.reply(user, mine.id, "Actually it switched off again", false);
    expect((await getStore().get("support_tickets", mine.id))!.status).toBe("open");
  });
});
