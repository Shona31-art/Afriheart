// Emoji, stickers, GIFs, voice-note upgrades and the WhatsApp-style chat menu, themes and lists.
// stars, forwarding, polls, location, contacts, documents, view once, delete for me, disappearing
// messages, search, pin/mute/archive, group admin tools and invite links, @mentions, status
// updates, privacy settings, and the Afriheart+ free week.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/expr", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname, "utf8");
const log = (...a) => console.log("•", ...a);
const seen = (loc, timeout = 12000) => loc.filter({ visible: true }).first().waitFor({ timeout }).then(() => true, () => false);
const pages = [];
const assert = async (c, m) => {
  if (!c) {
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}/FAIL-${i}.png` }).catch(() => {});
    throw new Error("ASSERT: " + m);
  }
  log("ok:", m);
};
const shot = async (p, n) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${n}.png` }); };
const axeIssues = {};
async function axe(p, name) {
  await p.addScriptTag({ content: AXE });
  axeIssues[name] = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`));
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone", "camera", "clipboard-read", "clipboard-write", "geolocation"], geolocation: { latitude: -29.8587, longitude: 31.0218 } };
const newPhone = async (extra = {}) => { const p = await (await browser.newContext({ ...phone, ...extra })).newPage(); pages.push(p); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };

async function signIn(p, name, number, next = "") {
  await p.goto(`${BASE}/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  await p.getByRole("button", { name: "Send me a code" }).click();
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  await p.getByLabel("Code").fill(await p.locator("[data-test-code]").getAttribute("data-test-code"));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"));
}
const row = (p, id, inner = "") => p.locator(`[data-chat-row="${id}"]${inner ? " " + inner : ""}`).filter({ visible: true }).first();
const box = (p) => p.getByLabel("Message", { exact: true }).filter({ visible: true });
async function say(p, text) {
  await box(p).fill(text);
  await p.getByRole("button", { name: "Send", exact: true }).click();
  await seen(p.locator("[data-message]").filter({ hasText: text }));
}
const bubble = (p, text) => p.locator("[data-message]").filter({ hasText: text }).last();
// The original message (a reply quoting it also contains its text).
const original = (p, text) => p.locator("[data-message]").filter({ hasText: text }).first();
async function options(p, text, first = false) {
  await (first ? original(p, text) : bubble(p, text)).click({ button: "right", position: { x: 12, y: 8 } });
  await p.locator("[data-message-sheet]").waitFor();
}
async function attach(p, label) {
  await p.getByRole("button", { name: "Photo, plan, cards and more" }).click();
  await p.locator("[data-attach-menu]").getByRole("button", { name: label }).click();
}

const A = await newPhone();
const B = await newPhone({ colorScheme: "dark" });
await signIn(A, "Zanele Dube", "082 555 9101");
await signIn(B, "Themba Sithole", "083 555 9202");
await B.goto(BASE);
const chatId = await A.evaluate(async () => (await (await fetch("/api/chats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "direct", phone: "083 555 9202" }) })).json()).id);
await A.goto(`${BASE}/chats/${chatId}`);
await B.goto(`${BASE}/chats/${chatId}`);
await A.waitForTimeout(1200);
const panel = (p) => p.locator("[data-expression-panel]").filter({ visible: true });

// ---- Message box like WhatsApp ----
for (const name of ["Emoji, stickers and GIFs", "Photo, plan, cards and more", "Take a photo", "Record voice note"]) {
  await assert(await seen(A.getByRole("button", { name })), `the message box has “${name}”`);
}
await A.getByRole("button", { name: "Photo, plan, cards and more" }).click();
for (const name of ["Gallery", "Camera", "Location", "Contact", "Document", "Poll", "Event"]) {
  await assert(await seen(A.locator("[data-attach-menu]").getByRole("button", { name })), `attach menu: ${name}`);
}
await axe(A, "attach-menu");
await shot(A, "01-attach-menu");
await A.getByRole("button", { name: "Photo, plan, cards and more" }).click();

// ---- Emoji ----
await A.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();
await axe(A, "emoji-panel");
await shot(A, "02-emoji-panel");
await panel(A).getByLabel("Search emoji").fill("braai");
await panel(A).getByRole("button", { name: /meat braai/ }).click();
await panel(A).getByLabel("Search emoji").fill("fire");
await panel(A).getByRole("button", { name: /fire hot/ }).first().click();
await assert((await box(A).inputValue()) === "🍖🔥", "picked emoji go into the message box");
await A.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(B.locator("[data-big-emoji]").getByText("🍖🔥")), "emoji-only messages show big, like WhatsApp");
if (!(await panel(A).count())) await A.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();
await panel(A).getByLabel("Search emoji").fill("");
await assert(await seen(panel(A).getByRole("region", { name: "Recently used" }).getByRole("button").first()), "recently used emoji come first");

// ---- Any emoji as a reaction ----
await B.locator("[data-message]").filter({ hasText: "🍖" }).last().click({ button: "right", position: { x: 10, y: 10 } });
await B.getByRole("button", { name: "More reactions" }).click();
await B.getByRole("dialog", { name: "Message options" }).getByLabel("Search emoji").fill("south africa");
await B.getByRole("dialog", { name: "Message options" }).getByRole("button", { name: /south africa flag/ }).click();
await assert(await seen(A.locator("[data-reactions]").filter({ hasText: "🇿🇦" })), "any emoji can be a reaction");

// ---- Stickers ----
await panel(A).getByRole("tab", { name: "Stickers" }).click();
await axe(A, "sticker-panel");
await shot(A, "03-stickers");
await panel(A).getByRole("button", { name: "Send sticker: Lekker!" }).click();
await assert(await seen(B.locator("[data-sticker]").getByRole("img", { name: "Sticker: Lekker!" })), "the other phone gets the Lekker! sticker");
await A.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();
await panel(A).getByRole("tab", { name: "Stickers" }).click();
await assert(await seen(panel(A).getByRole("region", { name: "Recent stickers" }).getByRole("button", { name: "Send sticker: Lekker!" })), "used stickers show under Recent");
await A.locator("[data-sticker-input]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
await assert(await seen(B.locator("[data-sticker]").getByRole("img", { name: "Sticker" }).last()), "a sticker made from a photo arrives (encrypted)");
await B.locator("[data-message]").filter({ has: B.getByRole("img", { name: "Sticker: Lekker!" }) }).click({ button: "right", position: { x: 20, y: 20 } });
await B.getByRole("button", { name: "Add to favourite stickers" }).click();
await assert(await seen(B.getByText("Added to your favourite stickers")), "stickers someone sent you can be saved");
await B.keyboard.press("Escape");
await B.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();
await panel(B).getByRole("tab", { name: "Stickers" }).click();
await assert(await seen(panel(B).getByRole("region", { name: "Favourite stickers" }).getByRole("button", { name: "Send sticker: Lekker!" })), "favourites show first");
await B.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();

// ---- GIFs ----
await A.getByRole("button", { name: "Emoji, stickers and GIFs" }).click();
await panel(A).getByRole("tab", { name: "GIFs" }).click();
await assert(await seen(panel(A).getByText("Powered by GIPHY")), "GIFs show GIPHY's credit");
await panel(A).getByLabel("Search GIFs").fill("dance");
await panel(A).getByRole("button", { name: /Send GIF: dance 1/ }).click();
await assert(await seen(B.locator("[data-gif]")), "the GIF arrives, sent as an encrypted file");
await shot(B, "04-stickers-gif-dark");

// ---- Voice notes: pause, carry on, listen first, waveform, speed, play next ----
await A.getByRole("button", { name: "Record voice note" }).click();
await A.waitForTimeout(1200);
await A.getByRole("button", { name: "Pause recording" }).click();
await assert(await seen(A.locator("[data-recording]").getByText(/Paused/)), "recording can be paused");
await A.waitForTimeout(800);
await A.getByRole("button", { name: "Carry on recording" }).click();
await A.waitForTimeout(1200);
await A.getByRole("button", { name: "Stop and listen" }).click();
await assert(await seen(A.locator("[data-voice-review] [data-waveform]")), "you can listen before sending, with a waveform");
await axe(A, "voice-review");
await shot(A, "05-voice-review");
await A.locator("[data-voice-review]").getByRole("button", { name: "Send voice note" }).click();
await A.getByRole("button", { name: "Record voice note" }).click();
await A.waitForTimeout(1300);
await A.locator("[data-recording]").getByRole("button", { name: "Send voice note" }).click();
await assert(await B.locator("[data-voice]").filter({ visible: true }).count().then(async (n) => n >= 2 || (await B.locator("[data-voice]").nth(1).waitFor({ timeout: 10000 }).then(() => true, () => false))), "both voice notes arrive");
const speed = B.locator("[data-voice-speed]").filter({ visible: true }).first();
await speed.click();
await assert((await speed.textContent()) === "1.5×", "playback speed goes to 1.5×");
await speed.click();
await assert((await B.locator("[data-voice-speed]").filter({ visible: true }).last().textContent()) === "2×", "…and 2×, for every voice note");
await speed.click();
await B.locator("[data-voice]").filter({ visible: true }).first().getByRole("button", { name: "Play voice note" }).click();
await assert(await seen(B.locator("[data-voice]").filter({ visible: true }).nth(1).getByRole("button", { name: "Pause voice note" }), 15000), "when one voice note ends, the next one plays");
await B.locator("[data-voice]").filter({ visible: true }).nth(1).getByRole("button", { name: "Pause voice note" }).click();

// ---- The ⋮ menu ----
await A.getByRole("button", { name: "More options" }).click();
for (const name of ["View contact", "Search", "Media, links and docs", "Mute notifications", "Disappearing messages", "Chat theme", "More"]) {
  await assert(await seen(A.getByRole("menuitem", { name: new RegExp(`^${name}`) })), `menu: ${name}`);
}
await axe(A, "header-menu");
await shot(A, "06-header-menu");
await A.getByRole("menuitem", { name: /^More/ }).click();
for (const name of ["Report", "Block", "Clear chat", "Export chat", "Add to list", "New group with Themba"]) {
  await assert(await seen(A.getByRole("menuitem", { name })), `menu, More: ${name}`);
}
await shot(A, "07-header-menu-more");
await A.getByRole("menuitem", { name: "Add to list" }).click();
await A.getByLabel("New list name").fill("Family");
await A.getByRole("button", { name: "Create" }).click();
await assert(await seen(A.locator("[data-list-picker]").getByRole("checkbox", { name: "Family" })), "a new list is made with this chat in it");
await axe(A, "lists");
await A.getByRole("button", { name: "Done" }).click();

await A.getByRole("button", { name: "More options" }).click();
await A.getByRole("menuitem", { name: "Chat theme" }).click();
await A.locator("[data-theme-picker]").getByRole("radio", { name: "Sage" }).click();
await A.locator("[data-theme-picker]").getByRole("radio", { name: "Clay" }).click();
await axe(A, "theme");
await shot(A, "08-theme");
await A.getByRole("button", { name: "Done" }).click();
const main = A.getByRole("main", { name: "Messages" });
await assert((await main.getAttribute("data-wall")) === "sage" && (await main.getAttribute("data-bubbles")) === "clay", "the chat theme changes the wallpaper and bubble colour");
await A.reload();
await assert((await A.getByRole("main", { name: "Messages" }).getAttribute("data-wall")) === "sage", "…and is remembered on this phone");

await A.getByRole("button", { name: "More options" }).click();
await A.getByRole("menuitem", { name: /^More/ }).click();
const dl = A.waitForEvent("download");
await A.getByRole("menuitem", { name: "Export chat" }).click();
await assert((await dl).suggestedFilename().includes("Themba"), "export chat downloads a .txt");

await A.getByRole("button", { name: "More options" }).click();
await A.getByRole("menuitem", { name: /^More/ }).click();
await A.getByRole("menuitem", { name: "New group with Themba" }).click();
await A.waitForURL("**/chats/new?group=**");
await assert((await A.getByLabel("Mobile numbers, one per line").inputValue()).includes("27835559202"), "New group with… fills in their number");

await A.goto(BASE);
await A.locator("[data-list-filter]").filter({ visible: true, hasText: "Family" }).click();
await assert(await seen(A.locator(`[data-chat-row="${chatId}"]`)), "the Family list shows as a filter with the chat in it");
await shot(A, "09-chat-list-lists");
await B.goto(`${BASE}/chats/${chatId}`);
await axe(B, "chat-dark-doodles");
await shot(B, "10-chat-dark");

// ---- Accessibility ----
let bad = 0;
for (const [name, list] of Object.entries(axeIssues)) {
  const serious = list.filter((v) => v.startsWith("serious") || v.startsWith("critical"));
  console.log(name, serious.length ? serious : "clean");
  bad += serious.length;
}
if (bad) throw new Error(`ASSERT: ${bad} serious accessibility issues`);
console.log("ALL EMOJI, STICKER, GIF AND VOICE CHECKS PASSED");
await browser.close();
