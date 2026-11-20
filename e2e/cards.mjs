// Talking cards: two phones play the same deck, live, in the chat and on top of a video call.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/cards", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname, "utf8");
const log = (...a) => console.log("•", ...a);
const seen = (loc, timeout = 10000) => loc.filter({ visible: true }).first().waitFor({ timeout }).then(() => true, () => false);
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

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera", "microphone"] };
const newPhone = async (extra = {}) => { const p = await (await browser.newContext({ ...phone, ...extra })).newPage(); pages.push(p); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };

async function signIn(p, name, number) {
  await p.goto(`${BASE}/signin?next=/`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  await p.getByRole("button", { name: "Send me a code" }).click();
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  await p.getByLabel("Code").fill(await p.locator("[data-test-code]").getAttribute("data-test-code"));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL((u) => u.pathname === "/");
}

const A = await newPhone();
const B = await newPhone({ colorScheme: "dark" });
await signIn(A, "Lwazi Dlamini", "082 555 6101");
await signIn(B, "Thabo Nkosi", "083 555 6202");

// 1. Lwazi opens Talking cards from the chat's + menu
await A.goto(`${BASE}/chats/new`);
await A.getByLabel("Their mobile number").fill("083 555 6202");
await A.getByRole("button", { name: "Open chat" }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();
await A.getByRole("button", { name: "Photo, plan, cards and more" }).click();
await A.getByRole("link", { name: "Talking cards" }).click();
await A.waitForURL("**/cards");
await assert(await seen(A.getByRole("heading", { name: "Talking cards" })), "cards page opens from the chat");
await assert((await A.getByRole("button", { name: /cards$/ }).count()) === 4, "four decks to choose from");
await shot(A, "01-choose-deck"); await axe(A, "choose-deck");

// 2. He picks Thoughtful; Thabo, on the same page, sees the deck arrive without reloading
await B.goto(`${chatUrl}/cards`);
await assert(await seen(B.getByText("Pick a deck")), "Thabo sees the deck picker");
await A.getByRole("button", { name: /^Thoughtful/ }).click();
await assert(await seen(A.getByText("Thoughtful · card 1 of 30")), "deck dealt");
await assert(await seen(A.getByText("Your turn to answer")), "whoever picks the deck answers first");
await assert(await seen(B.getByText("Thoughtful · card 1 of 30"), 4000), "Thabo sees the same deck live");
await assert(await seen(B.getByText("Lwazi answers this one")), "Thabo sees whose turn it is");
await shot(B, "02-card-back-dark"); await axe(B, "card-back-dark");

// 3. Thabo turns the card over; Lwazi sees the same question
await B.getByRole("button", { name: /Thoughtful Tap to turn over/ }).click();
const q = (await B.locator("[data-question]").first().textContent()).trim();
await assert(q.endsWith("?") || q.endsWith("."), `card turned over: "${q}"`);
const t0 = Date.now();
await assert(await seen(A.getByText(q, { exact: true }), 4000), "Lwazi sees the same question live");
log(`  card reached the other phone in ~${Date.now() - t0} ms`);
await shot(A, "03-card-question"); await axe(A, "card-question");
await shot(B, "04-card-question-dark"); await axe(B, "card-question-dark");

// 4. Next card: the turn passes to Thabo
await A.getByRole("button", { name: "Next card" }).click();
await assert(await seen(A.getByText("Thoughtful · card 2 of 30")), "next card");
await assert(await seen(A.getByText("Thabo answers this one")), "turns alternate");
await assert(await seen(B.getByText("Your turn to answer"), 4000), "Thabo sees it's his turn");

// 5. Lwazi starts a video call from the cards page: the cards come along
await A.getByRole("button", { name: "Video call" }).click();
await A.waitForURL("**/call/**");
await assert(await seen(A.getByRole("region", { name: "Talking cards" })), "the cards are open on the caller's screen");
await assert(await seen(B.getByRole("button", { name: "Answer" }), 10000), "Thabo's phone rings");
await B.getByRole("button", { name: "Answer" }).click();
await B.waitForURL("**/call/**");
await assert(await seen(B.locator("[data-remote-video]"), 15000), "video call connected");
await assert(await seen(B.getByRole("button", { name: "Talking cards" })), "Thabo has a Talking cards button on the call");

// 6. Lwazi turns the card during the call: the cards open on Thabo's call screen by themselves
await A.getByRole("button", { name: /Thoughtful Tap to turn over/ }).click();
const q2 = (await A.locator("[data-question]").first().textContent()).trim();
await assert(await seen(B.getByRole("region", { name: "Talking cards" }), 5000), "the cards open on Thabo's call screen when Lwazi plays");
await assert(await seen(B.getByText(q2, { exact: true }), 5000), "Thabo sees the card during the call");
await assert(await seen(B.getByText("Your turn to answer")), "and that it's his turn");
await shot(A, "05-call-cards-caller"); await axe(A, "call-cards");
await shot(B, "06-call-cards-dark");

// 7. Closing the cards keeps the call going; they stay closed until reopened
await B.getByRole("button", { name: "Close talking cards" }).click();
await assert(await seen(B.getByRole("button", { name: "Talking cards" })), "cards closed, button to reopen");
await A.getByRole("button", { name: "Next card" }).click();
await B.waitForTimeout(1500);
await assert(!(await B.getByRole("region", { name: "Talking cards" }).isVisible()), "closed cards don't pop back open");
await B.getByRole("button", { name: "Talking cards" }).click();
await assert(await seen(B.getByText("Thoughtful · card 3 of 30")), "reopened at the same card as Lwazi");
await assert(await B.locator("[data-remote-video]").first().isVisible(), "video still showing under the cards");
await A.getByRole("button", { name: "End call" }).click();

// 8. Change deck
await A.goto(`${chatUrl}/cards`);
await A.getByRole("button", { name: "Change deck" }).click();
await A.getByRole("button", { name: /^Playful/ }).click();
await assert(await seen(A.getByText("Playful · card 1 of 30")), "switched to Playful");
await A.getByRole("button", { name: /Playful Tap to turn over/ }).click();
await assert(await seen(A.locator("[data-question]")), "Playful card turned over");
await shot(A, "07-playful");

// 9. Play by text: send the card to the chat and answer it there
const q3 = (await A.locator("[data-question]").first().textContent()).trim();
await A.getByRole("button", { name: "Send to chat" }).click();
await assert(await seen(A.getByText("Sent to the chat.")), "card sent to the chat");
await B.goto(chatUrl);
const bubble = B.locator("[data-card-message]").filter({ hasText: q3 });
await assert(await seen(bubble), "Thabo sees the card in the chat");
await assert(await seen(bubble.getByText("Talking cards · Playful")), "the bubble says which deck");
await B.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Pap and chakalaka, all day 😄");
await B.getByRole("button", { name: "Send", exact: true }).click();
await A.goto(chatUrl);
await assert(await seen(A.locator("[data-card-message]").filter({ hasText: q3 })), "Lwazi sees the card in the chat");
await assert(await seen(A.getByText("Pap and chakalaka, all day 😄")), "and Thabo's answer under it");
await shot(A, "08-card-in-chat"); await axe(A, "card-in-chat");
await B.goto(`${BASE}/`);
await assert(await seen(B.getByText("Pap and chakalaka", { exact: false })), "chat list shows the latest message");
const raw = readFileSync(process.env.DB || "/tmp/common-cards.json", "utf8");
await assert(!raw.includes(q3), "the card's question is encrypted in the database, like any message");

// 10. Someone outside the chat can't see or play the game
const C = await newPhone();
await signIn(C, "Craig", "084 555 6303");
const id = new URL(chatUrl).pathname.split("/")[2];
const res = await C.evaluate(async (u) => (await fetch(u)).status, `/api/chats/${id}/cards`);
await assert(res >= 400, `an outsider can't read the game (${res})`);

for (const [k, v] of Object.entries(axeIssues)) console.log(k, v.length ? v.join("  ;  ") : "clean");
const bad = Object.values(axeIssues).flat().filter((v) => v.startsWith("serious") || v.startsWith("critical"));
await browser.close();
if (bad.length) { console.log("serious accessibility issues:", bad.length); process.exit(1); }
console.log("ALL TALKING CARDS CHECKS PASSED");
