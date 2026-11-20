import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "rt-")), "db.json");
const { getStore } = await import("@/lib/store");
const { hub } = await import("@/lib/realtime");
const { findOrCreatePerson } = await import("@/lib/domain");
const chat = await import("@/lib/chat");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function listen(personId: string) {
  const got: { chat?: string; call?: string }[] = [];
  const off = hub().subscribe(personId, (n) => got.push(n));
  return { got, off };
}

describe("realtime nudges", () => {
  it("nudges everyone in a chat when a message is posted, and nobody else", async () => {
    const a = (await findOrCreatePerson({ name: "Ayesha", phone: "27825550301", isGuest: false })).id;
    const b = (await findOrCreatePerson({ name: "Sipho", phone: "27835550302", isGuest: false })).id;
    const c = (await findOrCreatePerson({ name: "Craig", phone: "27845550303", isGuest: false })).id;
    const room = await chat.openDirectChat(a, "0835550302");
    await wait(80);
    const [la, lb, lc] = [listen(a), listen(b), listen(c)];
    await chat.postMessage(room.id, a, "text", "hi");
    await wait(80);
    expect(la.got).toContainEqual({ chat: room.id });
    expect(lb.got).toContainEqual({ chat: room.id });
    expect(lc.got).toEqual([]);
    [la, lb, lc].forEach((l) => l.off());
  });

  it("combines a burst of changes into one nudge per person", async () => {
    const a = (await findOrCreatePerson({ name: "Lebo", phone: "27825550304", isGuest: false })).id;
    await findOrCreatePerson({ name: "Thabo", phone: "27835550305", isGuest: false });
    const room = await chat.openDirectChat(a, "0835550305");
    await wait(80);
    const la = listen(a);
    for (let i = 0; i < 5; i++) await chat.postMessage(room.id, a, "text", `burst ${i}`);
    await wait(80);
    expect(la.got.filter((n) => n.chat === room.id).length).toBe(1);
    la.off();
  });

  it("sends call signals only to the person they're for", async () => {
    const a = listen("person-a");
    const b = listen("person-b");
    await getStore().insert("call_signals", { id: "sig-1", call_id: "call-1", from_id: "person-a", to_id: "person-b", type: "offer", payload: "{}", created_at: new Date().toISOString() });
    await wait(80);
    expect(b.got).toEqual([{ call: "call-1" }]);
    expect(a.got).toEqual([]);
    a.off(); b.off();
  });

  it("doesn't write 'delivered' on every check, only when something new arrived", async () => {
    const a = (await findOrCreatePerson({ name: "Nandi", phone: "27825550306", isGuest: false })).id;
    const b = (await findOrCreatePerson({ name: "Zola", phone: "27835550307", isGuest: false })).id;
    const room = await chat.openDirectChat(a, "0835550307");
    await chat.postMessage(room.id, b, "text", "hey");
    await chat.thread(room.id, a);
    const [me] = await getStore().list("chat_members", { chat_id: room.id, person_id: a });
    const stamp1 = me.last_delivered_at;
    expect(stamp1).toBeTruthy();
    await wait(5);
    await chat.thread(room.id, a);
    await chat.thread(room.id, a);
    const [again] = await getStore().list("chat_members", { chat_id: room.id, person_id: a });
    expect(again.last_delivered_at).toBe(stamp1);
  });
});

describe("new phones", () => {
  it("nudges everyone someone chats with when they register a phone, so waiting keys are re-sent", async () => {
    const a = (await findOrCreatePerson({ name: "Mpho", phone: "27825550308", isGuest: false })).id;
    const b = (await findOrCreatePerson({ name: "Sizwe", phone: "27835550309", isGuest: false })).id;
    const room = await chat.openDirectChat(a, "0835550309");
    await wait(80);
    const la = listen(a);
    await getStore().insert("devices", { id: "dev-sizwe", person_id: b, enc_pub: "x", sig_pub: "y", label: "Phone", created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), revoked_at: null } as never);
    await wait(80);
    expect(la.got).toContainEqual({ chat: room.id });
    la.off();
  });
});

describe("registering a phone twice", () => {
  it("returns the same device when the same keys are registered again (page closed before it saved its id)", async () => {
    const { registerDevice } = await import("@/lib/devices");
    const p = (await findOrCreatePerson({ name: "Nandi", phone: "27845550310", isGuest: false })).id;
    const key = (n: number) => Buffer.from([4, ...Array(64).fill(n)]).toString("base64");
    const first = await registerDevice(p, key(1), key(2), "Phone");
    const again = await registerDevice(p, key(1), key(2), "Phone");
    expect(again.id).toBe(first.id);
    const other = await registerDevice(p, key(3), key(4), "Laptop");
    expect(other.id).not.toBe(first.id);
  });
});
