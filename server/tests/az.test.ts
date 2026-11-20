import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "az-")), "db.json");

const { getStore } = await import("@/lib/store");
const { findOrCreatePerson } = await import("@/lib/domain");
const { openDirectChat, createGroup, stamp } = await import("@/lib/chat");
const az = await import("@/lib/az");

let a: string, b: string, chat: string;
beforeAll(async () => {
  a = (await findOrCreatePerson({ name: "Ayesha", phone: "27825550001", isGuest: false })).id;
  b = (await findOrCreatePerson({ name: "Sipho", phone: "27835550002", isGuest: false })).id;
  chat = (await openDirectChat(a, "0835550002")).id;
});

async function photoMessage(chatId: string, sender: string, cipher: string | null = "{\"sealed\":true}") {
  return getStore().insert("messages", {
    id: randomUUID(), chat_id: chatId, sender_id: sender, kind: "encrypted", body: "", media_path: null, media_ms: null,
    plan_id: null, call_id: null, cipher, awaiting: [], created_at: stamp(), updated_at: null,
  });
}

describe("Alphabet date ideas", () => {
  it("starts with 26 suggestions, A for Aquarium to Z for Zoo", async () => {
    const board = await az.azBoard(chat, a);
    expect(board.letters.map((l) => l.letter).join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(board.letters[0].activity).toBe("Aquarium");
    expect(board.letters[25].activity).toBe("Zoo");
    expect(board.done).toBe(0);
    for (const l of board.letters) {
      expect(l.activity[0].toUpperCase()).toBe(l.letter);
      expect(l.ideas.map((g) => g.style)).toEqual(["out", "home", "free", "food", "adventure"]);
      expect(l.ideas[0].items[0]).toBe(l.activity);
    }
  });

  it("lets either person change an idea, and both see it", async () => {
    await az.renameAz(chat, b, "b", "  Bubble tea and a bookshop ");
    const l = (await az.azBoard(chat, a)).letters[1];
    expect(l.activity).toBe("Bubble tea and a bookshop");
    expect(l.custom).toBe(true);
    await expect(az.renameAz(chat, a, "B", " ")).rejects.toThrow(/name/);
    await expect(az.renameAz(chat, a, "7", "Sevens rugby")).rejects.toThrow(/letter/);
  });

  it("ticks a letter off with your own encrypted photo message, and can be undone", async () => {
    const m = await photoMessage(chat, a);
    await az.completeAz(chat, a, "A", m.id);
    let l = (await az.azBoard(chat, b)).letters[0];
    expect(l.status).toBe("done");
    expect(l.photo).toEqual({ message_id: m.id, cipher: m.cipher, sender_id: a });
    expect(l.done_by).toBe(a);
    await az.undoAz(chat, b, "A");
    l = (await az.azBoard(chat, b)).letters[0];
    expect(l.status).toBe("idea");
    expect(l.photo).toBeNull();
  });

  it("refuses someone else's message, a message from another chat, or no photo", async () => {
    const theirs = await photoMessage(chat, b);
    await expect(az.completeAz(chat, a, "C", theirs.id)).rejects.toThrow(/didn't send/);
    const other = (await openDirectChat(a, "0845550003")).id;
    const elsewhere = await photoMessage(other, a);
    await expect(az.completeAz(chat, a, "C", elsewhere.id)).rejects.toThrow(/didn't send/);
    await expect(az.completeAz(chat, a, "C", "nope")).rejects.toThrow(/didn't send/);
  });

  it("shows done without a photo once the photo is deleted from the chat", async () => {
    const m = await photoMessage(chat, a);
    await az.completeAz(chat, a, "D", m.id);
    await getStore().update("messages", m.id, { kind: "system", cipher: null, body: "This message was deleted" });
    const l = (await az.azBoard(chat, a)).letters[3];
    expect(l.status).toBe("done");
    expect(l.photo).toBeNull();
  });

  it("is only for the two people in a one-to-one chat", async () => {
    const stranger = (await findOrCreatePerson({ name: "Kyle", phone: "27845550009", isGuest: false })).id;
    await expect(az.azBoard(chat, stranger)).rejects.toThrow();
    const group = (await createGroup(a, "Friends", ["0835550002"])).id;
    await expect(az.azBoard(group, a)).rejects.toThrow(/one-to-one/);
  });

  it("keeps each page's story as an encrypted message of your own", async () => {
    const story = await photoMessage(chat, b, "{\"sealed\":\"story\"}");
    await az.storyAz(chat, b, "E", story.id);
    const l = (await az.azBoard(chat, a)).letters[4];
    expect(l.story).toEqual({ message_id: story.id, cipher: story.cipher, sender_id: b });
    expect(l.status).toBe("idea"); // a story alone doesn't tick it off
    await expect(az.storyAz(chat, a, "E", story.id)).rejects.toThrow(/didn't send/);
  });

  it("has at least two ideas in every style for every letter, all starting with that letter", async () => {
    const { IDEAS, STYLES } = await import("@/lib/alphabet-ideas");
    for (const letter of az.LETTERS) {
      const all = STYLES.flatMap((st) => IDEAS[letter][st.id]);
      for (const st of STYLES) expect(IDEAS[letter][st.id].length, `${letter} ${st.id}`).toBeGreaterThanOrEqual(2);
      expect(new Set(all).size, `${letter} has duplicates`).toBe(all.length);
      expect(all.length).toBeGreaterThanOrEqual(10);
      for (const idea of all) {
        // X is allowed to cheat a little ("eXplore"), like every alphabet dating list does
        if (letter === "X") expect(idea.split(" ")[0]).toMatch(/x/i);
        else expect(idea[0].toUpperCase(), idea).toBe(letter);
      }
    }
  });

  it("changes the date style for untouched letters only, and the look for both people", async () => {
    const c = (await openDirectChat(a, "0865550004")).id;
    await az.renameAz(c, a, "B", "Bake-off at home");
    const m = await photoMessage(c, a);
    await az.completeAz(c, a, "A", m.id);
    await az.setAlbum(c, a, { style: "food", look: "midnight" });
    const board = await az.azBoard(c, a);
    expect(board.style).toBe("food");
    expect(board.look).toBe("midnight");
    expect(board.letters[0].activity).toBe("Aquarium"); // done: keeps its date
    expect(board.letters[1].activity).toBe("Bake-off at home"); // picked: keeps it
    expect(board.letters[2].activity).toBe("Cheese tasting"); // untouched: follows Foodie
    expect(board.letters[2].ideas[0].style).toBe("food");
    await az.setAlbum(c, a, { style: "nonsense", look: "neon" });
    const same = await az.azBoard(c, a);
    expect([same.style, same.look]).toEqual(["food", "midnight"]);
  });
});
