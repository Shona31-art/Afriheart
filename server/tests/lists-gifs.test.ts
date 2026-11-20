import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "lists-")), "db.json");
const { findOrCreatePerson } = await import("@/lib/domain");
const chat = await import("@/lib/chat");
const lists = await import("@/lib/chat-lists");
const gifs = await import("@/lib/gifs");
const { onlyEmoji } = await import("@/lib/expressions");
const { searchEmoji, EMOJI_GROUPS } = await import("@/lib/emoji-data");

let n = 0;
const person = async (name: string) => (await findOrCreatePerson({ name, phone: `2784${String(5550000 + ++n).padStart(7, "0")}`, isGuest: false })).id;

describe("chat lists", () => {
  it("are private, named once, and only hold chats you're in", async () => {
    const a = await person("Lerato");
    const b = await person("Musa");
    const c = await person("Outsider");
    const ab = await chat.openDirectChat(a, (await (await import("@/lib/store")).getStore().get("people", b))!.phone);
    const fam = await lists.createList(a, "Family", ab.id);
    expect(fam.chat_ids).toEqual([ab.id]);
    await expect(lists.createList(a, "family")).rejects.toThrow(/already/);
    await expect(lists.createList(a, "  ")).rejects.toThrow(/name/);
    await expect(lists.updateList(c, fam.id, { add: ab.id })).rejects.toThrow();
    const other = await lists.createList(c, "Mine");
    await expect(lists.updateList(c, other.id, { add: ab.id })).rejects.toThrow();
    expect((await lists.updateList(a, fam.id, { remove: ab.id })).chat_ids).toEqual([]);
    expect((await lists.myLists(b))).toEqual([]);
    await lists.deleteList(a, fam.id);
    expect(await lists.myLists(a)).toEqual([]);
  });
});

describe("GIFs", () => {
  it("are off without a key, and the file proxy only fetches from GIPHY's media servers", async () => {
    delete process.env.GIPHY_API_KEY;
    delete process.env.ALLOW_TEST_GIFS;
    expect(gifs.gifProvider()).toBeNull();
    await expect(gifs.searchGifs("braai")).rejects.toThrow(/switched on/);
    process.env.GIPHY_API_KEY = "k";
    for (const bad of ["http://media.giphy.com/x.mp4", "https://evil.example/x.mp4", "https://media.giphy.com.evil.example/x.mp4", "https://localhost/x", "test:1", "not a url"]) {
      expect(await gifs.gifFile(bad)).toBeNull();
    }
    delete process.env.GIPHY_API_KEY;
    process.env.ALLOW_TEST_GIFS = "yes-insecure";
    const r = await gifs.searchGifs("dance");
    expect(r).toHaveLength(6);
    expect(r[0].full).toMatch(/^\/api\/gifs\/file\?u=/);
    const f = await gifs.gifFile("test:0");
    expect(f?.type).toBe("image/gif");
  });
});

describe("emoji", () => {
  it("searches by words and spots emoji-only messages", () => {
    expect(searchEmoji("braai").map((e) => e.e)).toContain("🍖");
    expect(searchEmoji("south africa").map((e) => e.e)).toContain("🇿🇦");
    expect(EMOJI_GROUPS.reduce((n, g) => n + g.emojis.length, 0)).toBeGreaterThan(500);
    expect(onlyEmoji("😂")).toBe(true);
    expect(onlyEmoji("❤️🔥😍")).toBe(true);
    expect(onlyEmoji("🇿🇦")).toBe(true);
    expect(onlyEmoji("😂😂😂😂")).toBe(false);
    expect(onlyEmoji("lol 😂")).toBe(false);
    expect(onlyEmoji("123")).toBe(false);
  });
});
