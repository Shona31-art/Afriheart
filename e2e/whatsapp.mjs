// WhatsApp-style chat features on simulated phones: typing, online, reactions, replies, edits,
// stars, forwarding, polls, location, contacts, documents, view once, delete for me, disappearing
// messages, search, pin/mute/archive, group admin tools and invite links, @mentions, status
// updates, privacy settings, and the Afriheart+ free week.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/wa", import.meta.url).pathname;
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
const C = await newPhone();
await signIn(A, "Lindiwe Zulu", "082 555 8101");
await signIn(B, "Kagiso Molefe", "083 555 8202");
await signIn(C, "Naledi Khumalo", "084 555 8303");

// Both phones need their keys before the first message.
await B.goto(BASE);
await C.goto(BASE);
const chatId = await A.evaluate(async () => (await (await fetch("/api/chats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "direct", phone: "083 555 8202" }) })).json()).id);
await A.goto(`${BASE}/chats/${chatId}`);
await B.goto(`${BASE}/chats/${chatId}`);
await A.waitForTimeout(1500);

// ---- Online and typing ----
await assert(await seen(A.locator("[data-chat-subtitle]").getByText("online")), "Lindiwe sees Kagiso is online");
await box(B).pressSequentially("Hel", { delay: 60 });
await assert(await seen(A.locator("[data-chat-subtitle]").getByText("typing…"), 6000), "Lindiwe sees “typing…” while Kagiso types");
await box(B).fill("");
await say(A, "Hello Kagiso! Lunch on Friday?");
await assert(await seen(bubble(B, "Lunch on Friday")), "message arrives");

// ---- Reactions ----
await options(B, "Lunch on Friday");
await axe(B, "message-sheet");
await shot(B, "01-message-sheet");
await B.getByRole("button", { name: "React ❤️" }).click();
await assert(await seen(A.locator("[data-reactions]").filter({ hasText: "❤️" })), "Lindiwe sees Kagiso's ❤️ reaction");

// ---- Reply (quote) ----
await options(B, "Lunch on Friday");
await B.getByRole("button", { name: "Reply" }).click();
await assert(await seen(B.locator("[data-composer-context]").getByText("Replying to Lindiwe Zulu")), "reply bar shows who you're replying to");
await say(B, "Yes please, somewhere near the beach");
await assert(await seen(A.locator("[data-message]").filter({ hasText: "near the beach" }).locator("[data-quote]").getByText("Lunch on Friday")), "the reply quotes the original message");

// ---- Edit ----
await options(A, "Lunch on Friday", true);
await A.getByRole("button", { name: "Edit" }).click();
await box(A).fill("Hello Kagiso! Lunch on Saturday?");
await A.getByRole("button", { name: "Save edit" }).click();
await assert(await seen(B.locator("[data-message]").filter({ hasText: "Lunch on Saturday" }).locator("[data-edited]")), "Kagiso sees the edited text, marked Edited");
await assert(!(await B.locator("[data-message]").filter({ hasText: "Lunch on Friday?" }).filter({ hasNot: B.locator("[data-quote]") }).count()), "the old text is gone (a reply keeps its quote, like WhatsApp)");

// ---- Star ----
await options(A, "near the beach");
await A.getByRole("button", { name: "Star" }).click();
await assert(await seen(bubble(A, "near the beach").locator("[data-starred]")), "starred messages show a star");
await A.goto(`${BASE}/starred`);
await assert(await seen(A.locator("[data-starred-list]").getByText("near the beach")), "it's on the Starred messages page");
await axe(A, "starred");
await A.goto(`${BASE}/chats/${chatId}`);

// ---- Polls ----
await attach(A, "Poll");
await A.getByLabel("Poll question").fill("Where should we eat?");
await A.getByLabel("Option 1").fill("Florida Road");
await A.getByLabel("Option 2").fill("Umhlanga promenade");
await A.getByRole("button", { name: "Send poll" }).click();
await assert(await seen(B.locator("[data-poll]").getByText("Where should we eat?")), "Kagiso gets the poll");
await B.locator("[data-poll]").getByRole("button", { name: /Umhlanga promenade/ }).click();
await assert(await seen(A.locator("[data-poll]").getByText("1 person has voted")), "Lindiwe sees the vote count");
await assert(await seen(A.locator("[data-poll]").getByText("Kagiso")), "…and who voted");
await shot(A, "02-poll-reply-reaction");

// ---- Location, contact, document ----
await attach(A, "Location");
await A.getByLabel("Place name").fill("Moyo uShaka");
await A.getByRole("button", { name: "Send location" }).click();
await assert(await seen(B.locator("[data-location]").getByText("Moyo uShaka")), "a location arrives with an Open in Maps link");
await attach(A, "Contact");
await A.getByLabel("Contact name").fill("Naledi Khumalo");
await A.getByLabel("Contact number").fill("084 555 8303");
await A.getByRole("button", { name: "Send contact" }).click();
await assert(await seen(B.locator("[data-contact]").getByText("Naledi Khumalo")), "a contact card arrives");
await assert(await seen(B.locator("[data-contact]").getByText("+27 84 555 8303")), "…with the number in the usual format");
writeFileSync("/tmp/menu.pdf", "%PDF-1.4\n% Afriheart test menu\n");
await A.locator("[data-doc-input]").setInputFiles("/tmp/menu.pdf");
await assert(await seen(B.locator("[data-file]").getByText("menu.pdf")), "a document arrives");
const download = B.waitForEvent("download", { timeout: 10000 });
await B.locator("[data-file]").filter({ hasText: "menu.pdf" }).click();
const file = await download;
await assert(file.suggestedFilename() === "menu.pdf", "the document downloads (decrypted on the phone)");
await shot(B, "03-location-contact-document");

// ---- View once ----
await A.locator("[data-photo-input]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
await A.getByRole("button", { name: "View once" }).click();
await A.getByRole("button", { name: "Send photo" }).click();
await assert(await seen(B.locator("[data-view-once]").getByText(/tap to view once/)), "Kagiso gets a view-once photo");
await B.locator("[data-view-once]").getByText(/tap to view once/).click();
await assert(await seen(B.getByRole("button", { name: "Close photo" })), "it opens full screen");
await B.getByRole("button", { name: "Close photo" }).click();
await assert(await seen(B.locator("[data-view-once]").getByText("Opened")), "after closing, it can't be opened again");
await assert(await seen(A.locator("[data-view-once]").getByText(/Opened/)), "Lindiwe sees it was opened");

// ---- Message info, delete for me ----
await options(A, "Lunch on Saturday", true);
await A.getByRole("button", { name: "Info" }).click();
await assert(await seen(A.locator("[data-message-info]").getByText("Read")), "message info shows it was read");
await A.getByRole("button", { name: "Close" }).click();
await options(B, "Lunch on Saturday", true);
await B.getByRole("button", { name: "Delete" }).click();
await B.getByRole("button", { name: "Delete for me" }).click();
await assert(await B.locator("[data-message]").filter({ hasText: "Lunch on Saturday" }).filter({ hasNot: B.locator("[data-quote]") }).waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false), "delete for me removes it on Kagiso's phone");
await assert(await seen(bubble(A, "Lunch on Saturday")), "…but not on Lindiwe's");

// ---- Search ----
await A.getByRole("button", { name: "More options" }).click();
await A.getByRole("menuitem", { name: "Search" }).click();
await A.getByLabel("Search messages").fill("beach");
await assert(await seen(A.locator("[data-search-results]").getByText("near the beach")), "search finds messages (decrypted on the phone)");
await axe(A, "search");
await A.getByRole("button", { name: "Close search" }).click();

// ---- Forward ----
const groupId = await A.evaluate(async () => (await (await fetch("/api/chats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "group", name: "Durban foodies", phones: ["083 555 8202", "084 555 8303"] }) })).json()).id);
await A.reload();
await options(A, "near the beach");
await A.getByRole("button", { name: "Forward" }).click();
await A.getByRole("dialog", { name: "Forward to…" }).getByText("Durban foodies").click();
await A.getByRole("button", { name: "Send to 1" }).click();
await C.goto(`${BASE}/chats/${groupId}`);
await assert(await seen(C.locator("[data-message]").filter({ hasText: "near the beach" }).locator("[data-forwarded]")), "forwarded message arrives in the group, labelled Forwarded");

// ---- Disappearing messages ----
await A.goto(`${BASE}/chats/${chatId}/info`);
await axe(A, "chat-info");
await Promise.all([A.waitForResponse((r) => r.url().endsWith("/settings")), A.getByRole("radio", { name: "7 days" }).click()]);
await A.goto(`${BASE}/chats/${chatId}`);
await assert(await seen(A.locator("[data-disappearing-on]")), "the chat says disappearing messages are on");
await assert(await seen(B.getByText(/turned on disappearing messages/)), "both see who turned them on");
await say(A, "This one disappears in 7 days");
await assert(await seen(bubble(A, "disappears in 7 days").getByLabel("Disappearing")), "new messages carry the timer");
await shot(A, "04-disappearing-view-once");

// ---- Chat list: pin, mute, archive, unread filter ----
await B.goto(BASE);
await row(B, chatId).click({ button: "right" });
await axe(B, "chat-menu");
await shot(B, "05-chat-menu");
await B.getByRole("button", { name: "Pin chat" }).click();
await assert(await seen(row(B, chatId, "[data-pinned]")), "pinned chats show a pin");
await row(B, groupId).click({ button: "right" });
await B.getByRole("button", { name: "Mute notifications" }).click();
await B.getByRole("button", { name: "1 week" }).click();
await assert(await seen(row(B, groupId).getByLabel("Muted")), "muted chats show a muted icon");
await row(B, groupId).click({ button: "right" });
await B.getByRole("button", { name: "Archive chat" }).click();
await assert(await seen(B.locator("[data-archived-row]").filter({ visible: true }).first()), "archived chats move to Archived");
await B.locator("[data-archived-row]").filter({ visible: true }).first().click();
await assert(await seen(row(B, groupId)), "…where they can be found");
await B.getByRole("button", { name: "Back to chats" }).filter({ visible: true }).first().click();
await B.getByRole("button", { name: "Unread", exact: true }).filter({ visible: true }).first().click();
await assert(await row(B, chatId).count() === 0 || (await row(B, chatId, "[data-unread]").count()) > 0, "the Unread filter shows only unread chats");
await B.getByRole("button", { name: "All", exact: true }).filter({ visible: true }).first().click();

// ---- Group admin: only admins send, invite link, @mentions ----
await A.goto(`${BASE}/chats/${groupId}`);
await box(A).fill("Hi @Kag");
await assert(await seen(A.getByRole("list", { name: "Mention someone" }).getByText("@Kagiso Molefe")), "typing @ suggests people in the group");
await A.getByRole("list", { name: "Mention someone" }).getByText("@Kagiso Molefe").click();
await A.getByRole("button", { name: "Send", exact: true }).click();
await C.goto(`${BASE}/chats/${groupId}`);
await assert(await seen(C.locator("[data-mention]").getByText("@Kagiso")), "mentions are highlighted");
await A.goto(`${BASE}/chats/${groupId}/info`);
await A.getByLabel("Description", { exact: true }).fill("Food spots around Durban 🍛");
await A.getByRole("button", { name: "Save" }).click();
await Promise.all([A.waitForResponse((r) => r.url().endsWith("/settings")), A.getByRole("checkbox", { name: /Only admins can send messages/ }).check()]);
await A.getByRole("button", { name: "Show invite link" }).click();
const link = await A.locator("[data-invite-link]").textContent();
await assert(link.includes("/join/"), "admins get an invite link");
await shot(A, "06-group-admin");
await C.goto(`${BASE}/chats/${groupId}`);
await assert(await seen(C.locator("[data-admins-only]")), "members see only admins can send");
await A.getByRole("button", { name: "Naledi Khumalo" }).click();
A.once("dialog", (d) => d.accept());
await Promise.all([A.waitForResponse((r) => r.url().includes("/members/")), A.getByRole("button", { name: "Remove Naledi" }).click()]);
await A.goto(`${BASE}/chats/${groupId}`);
await assert(await seen(A.getByText("removed Naledi Khumalo")), "admins can remove people");
await C.goto(`${BASE}/chats/${groupId}`).catch(() => {});
await assert(await seen(C.getByText(/isn't found|not found|could not be found/i)) || !C.url().includes(groupId) || (await C.locator("[data-message]").count()) === 0, "someone removed can't open the group");
await C.goto(link);
await assert(await seen(C.locator("[data-join]").getByText("Durban foodies")), "the invite link shows the group");
await axe(C, "join");
await C.getByRole("button", { name: "Join group" }).click();
await C.waitForURL(`**/chats/${groupId}`);
await assert(await seen(C.getByText("joined using the invite link")), "joining with the link works");
await assert(!(await C.locator("[data-message]").filter({ hasText: "near the beach" }).count()), "new members don't see messages from before they joined");

// ---- Status ----
await A.goto(BASE);
await A.getByRole("link", { name: "My status" }).filter({ visible: true }).first().click();
await A.waitForURL("**/status/new");
await A.getByLabel("Status text").fill("Bunny chow Friday 🍛");
await axe(A, "status-new");
await A.getByRole("button", { name: "Post status" }).click();
await A.waitForURL(`${BASE}/`);
await B.goto(BASE);
await assert(await seen(B.locator("[data-status-strip]").filter({ visible: true }).first().getByText("Lindiwe")), "contacts see the status in the strip");
await B.locator("[data-status-strip]").filter({ visible: true }).first().getByText("Lindiwe").click();
await assert(await seen(B.locator("[data-status-text]").getByText("Bunny chow Friday")), "the status opens (decrypted)");
await axe(B, "status-view");
await shot(B, "07-status");
await B.getByLabel("Reply to this status").fill("I'm in!");
await B.getByRole("button", { name: "Send reply" }).click();
await assert(await seen(B.getByText("Reply sent")), "replying to a status sends a chat message");
await A.goto(`${BASE}/status?p=me`);
await assert(await seen(A.locator("[data-status-views]").getByText("1 view")), "Lindiwe sees who viewed it");
await A.goto(`${BASE}/status/new`);
// Pick the photo once the page is ready (a file chosen before then is ignored, as on a real phone).
for (let i = 0; i < 5; i++) {
  await A.waitForTimeout(800);
  await A.locator("[data-status-photo]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
  if (await A.getByRole("img", { name: "Your status photo" }).waitFor({ timeout: 3000 }).then(() => true, () => false)) break;
}
await A.getByLabel("Caption").fill("Beach day 🌊");
await A.getByRole("button", { name: "Post status" }).click();
await A.waitForURL(`${BASE}/`);
await B.goto(BASE);
await B.locator("[data-status-strip]").filter({ visible: true }).first().getByText("Lindiwe").click();
await B.getByRole("button", { name: "Next" }).click();
await assert(await seen(B.getByRole("img", { name: "Beach day 🌊" })), "photo statuses work too (encrypted)");
await C.goto(BASE);
await C.waitForTimeout(1500);
await assert(!(await C.locator("[data-status-strip]").filter({ visible: true }).getByText("Lindiwe").count()), "statuses only go to one-to-one contacts (not group members)");

// ---- Privacy settings ----
await B.goto(`${BASE}/you`);
await B.locator("[data-privacy]").filter({ visible: true }).getByRole("checkbox", { name: /online and last seen/ }).uncheck();
await A.goto(`${BASE}/chats/${chatId}`);
await A.waitForTimeout(1500);
await assert(!(await A.locator("[data-chat-subtitle]").getByText(/online|last seen/).count()), "turning off last seen hides it");
await shot(A, "08-chat");

// ---- Afriheart+ free week ----
await C.goto(`${BASE}/plus`);
await assert(await seen(C.locator("[data-trial-start]")), "someone new can start a free week");
await C.getByRole("button", { name: "Start my free week" }).click();
await assert(await seen(C.locator("[data-plus-active]").getByText("Your free week of Afriheart+ is on")), "the free week starts, no card needed");
await axe(C, "plus-trial");
await shot(C, "09-plus-trial");

// ---- Accessibility ----
let bad = 0;
for (const [name, list] of Object.entries(axeIssues)) {
  const serious = list.filter((v) => v.startsWith("serious") || v.startsWith("critical"));
  console.log(name, serious.length ? serious : "clean");
  bad += serious.length;
}
if (bad) throw new Error(`ASSERT: ${bad} serious accessibility issues`);
console.log("ALL WHATSAPP FEATURE CHECKS PASSED");
await browser.close();
