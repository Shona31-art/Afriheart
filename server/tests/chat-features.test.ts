import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "chatx-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
process.env.LOCAL_MEDIA_DIR = path.join(dir, "media");
const { findOrCreatePerson } = await import("@/lib/domain");
const chat = await import("@/lib/chat");
const x = await import("@/lib/chat-extras");
const devices = await import("@/lib/devices");
const status = await import("@/lib/status");
const { getStore } = await import("@/lib/store");
const { generateDeviceKeys, sealEnvelope } = await import("@/lib/e2e-crypto");
const { saveOwnedMedia, readMedia } = await import("@/lib/media");

let n = 0;
type Keys = Awaited<ReturnType<typeof generateDeviceKeys>>;
const people = new Map<string, { device: string; keys: Keys }>();

async function person(name: string) {
  const id = (await findOrCreatePerson({ name, phone: `2783${String(5550000 + ++n).padStart(7, "0")}`, isGuest: false })).id;
  const keys = await generateDeviceKeys();
  const d = await devices.registerDevice(id, keys.encPub, keys.sigPub, "Phone");
  people.set(id, { device: d.id, keys });
  return id;
}
const phone = async (id: string) => (await getStore().get("people", id))!.phone;

/** Seals a payload for everyone in the chat, like the phone does. */
async function seal(chatId: string, from: string, payload: unknown) {
  const me = people.get(from)!;
  const list = await devices.chatDevices(chatId, from);
  return sealEnvelope({ chatId, payload, sender: { deviceId: me.device, sigPriv: me.keys.sigPriv }, recipients: list.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })) });
}
const send = async (chatId: string, from: string, payload: unknown, opts: { meta?: string; target?: string; media?: string } = {}) =>
  devices.sendEncrypted(chatId, from, await seal(chatId, from, payload), opts);

describe("reactions, edits and poll votes", () => {
  it("are hidden helpers: no unread count, no chat-list move, and only the sender can edit, within 15 minutes", async () => {
    const a = await person("Ama");
    const b = await person("Bongani");
    const c = await chat.openDirectChat(a, await phone(b));
    const msg = await send(c.id, a, { t: "text", text: "hi" });
    await chat.markRead(c.id, b);
    const before = (await chat.listChats(b))[0];

    await send(c.id, b, { t: "react", emoji: "❤️" }, { meta: "react", target: msg.id });
    await send(c.id, a, { t: "edit", text: "hi there" }, { meta: "edit", target: msg.id });
    const after = (await chat.listChats(b))[0];
    expect(after.unread).toBe(0);
    expect(after.last_message_at).toBe(before.last_message_at);

    await expect(send(c.id, b, { t: "edit", text: "hacked" }, { meta: "edit", target: msg.id })).rejects.toThrow(/own messages/);
    await getStore().update("messages", msg.id, { created_at: new Date(Date.now() - 16 * 60_000).toISOString() });
    await expect(send(c.id, a, { t: "edit", text: "late" }, { meta: "edit", target: msg.id })).rejects.toThrow(/15 minutes/);
    await expect(send(c.id, a, { t: "react", emoji: "x" }, { meta: "nope", target: msg.id })).rejects.toThrow(/Unknown/);

    // The thread sends the helpers with the message they're about.
    const t = await chat.thread(c.id, b);
    expect(t.messages.filter((m) => m.meta).map((m) => m.meta).sort()).toEqual(["edit", "react"]);
  });

  it("deleting a message for everyone removes its reactions too, and only for about two days", async () => {
    const a = await person("Ayanda");
    const b = await person("Buhle");
    const c = await chat.openDirectChat(a, await phone(b));
    const msg = await send(c.id, a, { t: "text", text: "oops" });
    await send(c.id, b, { t: "react", emoji: "😂" }, { meta: "react", target: msg.id });
    await chat.deleteMessage(c.id, a, msg.id);
    const msgs = await getStore().list("messages", { chat_id: c.id });
    expect(msgs.find((m) => m.id === msg.id)!.kind).toBe("system");
    expect(msgs.some((m) => m.target_id === msg.id)).toBe(false);

    const old = await send(c.id, a, { t: "text", text: "old" });
    await getStore().update("messages", old.id, { created_at: new Date(Date.now() - 3 * 86400_000).toISOString() });
    await expect(chat.deleteMessage(c.id, a, old.id)).rejects.toThrow(/too late/);
  });
});

describe("stars, delete for me, clear and delete chat", () => {
  it("works per person and leaves the other person's chat alone", async () => {
    const a = await person("Asanda");
    const b = await person("Bheki");
    const c = await chat.openDirectChat(a, await phone(b));
    const m1 = await send(c.id, a, { t: "text", text: "one" });
    const m2 = await send(c.id, b, { t: "text", text: "two" });
    await x.setStar(c.id, a, m2.id, true);
    expect((await chat.thread(c.id, a)).starred).toEqual([m2.id]);
    expect((await x.starredMessages(a)).map((s) => s.id)).toEqual([m2.id]);

    await x.hideMessage(c.id, a, m1.id);
    expect((await chat.thread(c.id, a)).messages.map((m) => m.id)).not.toContain(m1.id);
    expect((await chat.thread(c.id, b)).messages.map((m) => m.id)).toContain(m1.id);

    await x.clearChat(c.id, a, true);
    expect((await chat.thread(c.id, a)).messages).toHaveLength(0);
    expect((await chat.listChats(a)).some((s) => s.id === c.id)).toBe(false);
    expect((await chat.thread(c.id, b)).messages.length).toBe(2);
    // A new message brings it back.
    await send(c.id, b, { t: "text", text: "you there?" });
    expect((await chat.listChats(a)).some((s) => s.id === c.id)).toBe(true);
  });
});

describe("pin, mute, archive and mark unread", () => {
  it("pins up to three chats on top, and muted chats don't send pop-ups", async () => {
    const a = await person("Aphiwe");
    const others = [await person("P1"), await person("P2"), await person("P3"), await person("P4")];
    const chats: { id: string }[] = [];
    for (const o of others) chats.push(await chat.openDirectChat(a, await phone(o)));
    for (const c of chats.slice(0, 3)) await x.setChatPrefs(c.id, a, { pin: true });
    await expect(x.setChatPrefs(chats[3].id, a, { pin: true })).rejects.toThrow(/up to 3/);
    const list = await chat.listChats(a);
    expect(list.slice(0, 3).every((c) => c.pinned)).toBe(true);
    expect(list[0].id).toBe(chats[2].id); // most recently pinned first

    await x.setChatPrefs(chats[3].id, a, { mute: "week", archive: true, unread: true });
    const s = (await chat.listChats(a)).find((c) => c.id === chats[3].id)!;
    expect(s).toMatchObject({ muted: true, archived: true, marked_unread: true });
    await chat.markRead(chats[3].id, a);
    expect((await chat.listChats(a)).find((c) => c.id === chats[3].id)!.marked_unread).toBe(false);
    await expect(x.setChatPrefs(chats[3].id, a, { mute: "forever-ish" })).rejects.toThrow();
  });
});

describe("disappearing messages and view once", () => {
  it("expires new messages and deletes them for good", async () => {
    const a = await person("Andile");
    const b = await person("Busi");
    const c = await chat.openDirectChat(a, await phone(b));
    await x.setDisappearing(c.id, a, 86400);
    await expect(x.setDisappearing(c.id, a, 3600)).rejects.toThrow();
    const m = await send(c.id, a, { t: "text", text: "gone tomorrow" });
    expect(Date.parse(m.expires_at!) - Date.now()).toBeGreaterThan(86000_000);
    await getStore().update("messages", m.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await chat.thread(c.id, b)).messages.some((x) => x.id === m.id)).toBe(false);
    expect(await getStore().get("messages", m.id)).toBeNull();
    // The note about the timer stays.
    expect((await chat.thread(c.id, b)).messages.some((x) => x.kind === "system" && x.body.includes("disappearing"))).toBe(true);
  });

  it("deletes a view-once photo's file once everyone has opened it", async () => {
    const a = await person("Akhona");
    const b = await person("Bonga");
    const c = await chat.openDirectChat(a, await phone(b));
    const file = await saveOwnedMedia(a, "chat", c.id, new Uint8Array([1, 2, 3]), "application/octet-stream");
    await expect(send(c.id, b, { t: "text", text: "x" }, { media: file })).rejects.toThrow(/isn't available/);
    const m = await send(c.id, a, { t: "image", once: true }, { media: file });
    expect(await readMedia(file)).not.toBeNull();
    await x.markOpened(c.id, b, m.id);
    expect(await readMedia(file)).toBeNull();
    expect((await getStore().get("messages", m.id))!.opened_by).toEqual([b]);
    expect((await x.messageInfo(c.id, a, m.id)).people[0].opened).toBe(true);
  });
});

describe("groups", () => {
  it("admins control sending, settings and members; invite links let people join", async () => {
    const admin = await person("Admin Ayo");
    const member = await person("Member Mpho");
    const outsider = await person("New Nomsa");
    const g = await chat.createGroup(admin, "Braai crew", [await phone(member)]);
    await x.setGroupPermissions(g.id, admin, { admins_only_send: true });
    await expect(send(g.id, member, { t: "text", text: "hi" })).rejects.toThrow(/Only admins/);
    const ann = await send(g.id, admin, { t: "text", text: "Saturday 2pm" });
    await send(g.id, member, { t: "react", emoji: "👍" }, { meta: "react", target: ann.id }); // reactions still fine
    expect((await chat.thread(g.id, member)).chat.can_send).toBe(false);

    await x.updateGroup(g.id, member, { description: "Everyone welcome" });
    expect((await getStore().get("chats", g.id))!.description).toBe("Everyone welcome");
    await x.setGroupPermissions(g.id, admin, { admins_only_info: true });
    await expect(x.updateGroup(g.id, member, { name: "Hijacked" })).rejects.toThrow(/Only admins/);
    await expect(x.setGroupPermissions(g.id, member, { admins_only_send: false })).rejects.toThrow(/admins/);

    const { token } = await x.inviteLink(g.id, admin, false);
    expect((await x.inviteLink(g.id, admin, false)).token).toBe(token);
    expect((await x.invitePreview(token, outsider)).count).toBe(2);
    await x.joinByInvite(token, outsider);
    expect((await chat.chatMembers(g.id)).length).toBe(3);
    const reset = await x.inviteLink(g.id, admin, true);
    expect(reset.token).not.toBe(token);
    await expect(x.joinByInvite(token, member)).rejects.toThrow(/reset/);

    await x.setAdmin(g.id, admin, member, true);
    await x.removeFromGroup(g.id, member, outsider);
    expect((await chat.chatMembers(g.id)).length).toBe(2);
    await expect(x.setAdmin(g.id, outsider, member, false)).rejects.toThrow();
  });
});

describe("last seen and read receipts", () => {
  it("hides both ways when either person turns them off", async () => {
    const a = await person("Anele");
    const b = await person("Bafana");
    const c = await chat.openDirectChat(a, await phone(b));
    await x.touchPresence(b, true);
    expect((await chat.thread(c.id, a)).presence?.online).toBe(true);
    await x.setPrivacy(a, { hide_last_seen: true });
    expect((await chat.thread(c.id, a)).presence).toBeNull();
    expect((await chat.thread(c.id, b)).presence).toBeNull();

    const m = await send(c.id, a, { t: "text", text: "read me" });
    await chat.markRead(c.id, b);
    const status = () => chat.thread(c.id, a).then((t) => t.messages.find((x) => x.id === m.id)!.status);
    expect(await status()).toBe("read");
    await x.setPrivacy(b, { read_receipts_off: true });
    expect(await status()).toBe("delivered");
  });
});

describe("status updates", () => {
  it("go to one-to-one contacts only, must be sealed for all their phones, and expire after a day", async () => {
    const a = await person("Asive");
    const friend = await person("Friend Fezile");
    const stranger = await person("Stranger Sam");
    await chat.openDirectChat(a, await phone(friend));
    const list = await status.statusDevices(a);
    expect(list.map((d) => d.person_id).sort()).toEqual([a, friend].sort());

    const me = people.get(a)!;
    const sealFor = (ds: typeof list) => sealEnvelope({ chatId: `status:${a}`, payload: { t: "status", text: "Braai today!" }, sender: { deviceId: me.device, sigPriv: me.keys.sigPriv }, recipients: ds.map((d) => ({ deviceId: d.id, encPub: d.enc_pub })) });
    await expect(status.postStatus(a, await sealFor(list.slice(0, 1)), null)).rejects.toThrow("devices_changed");
    const st = await status.postStatus(a, await sealFor(list), null);

    expect((await status.statusFeed(friend)).others.map((o) => o.person_id)).toEqual([a]);
    expect((await status.statusFeed(stranger)).others).toHaveLength(0);
    await expect(status.viewStatus(stranger, st.id)).rejects.toThrow();
    await status.viewStatus(friend, st.id);
    expect((await status.statusFeed(a)).mine[0].views.map((v) => v.name)).toEqual(["Friend Fezile"]);
    expect((await status.statusFeed(friend)).others[0].unseen).toBe(0);
    expect(await status.canSeeStatusMedia(friend, `status-${a}`)).toBe(true);
    expect(await status.canSeeStatusMedia(stranger, `status-${a}`)).toBe(false);

    await getStore().update("statuses", st.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await status.statusFeed(a)).mine).toHaveLength(0);
    expect(await getStore().get("statuses", st.id)).toBeNull();
  });
});
