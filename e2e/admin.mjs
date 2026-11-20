// The super admin side and the support page, on simulated phones and a computer.
// stars, forwarding, polls, location, contacts, documents, view once, delete for me, disappearing
// messages, search, pin/mute/archive, group admin tools and invite links, @mentions, status
// updates, privacy settings, and the Afriheart+ free week.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/admin", import.meta.url).pathname;
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

// Start the server with SUPER_ADMIN_PHONES=0825558888.
const U = await newPhone();
const X = await newPhone({ colorScheme: "dark" });
const Boss = await newPhone({ viewport: { width: 1280, height: 860 } });
const H = await newPhone();
const V = await newPhone();
await signIn(U, "Unathi Mokoena", "082 555 7301");
await signIn(H, "Hlengiwe Support", "082 555 7303");
await signIn(V, "Vusi Trouble", "082 555 7304");
await signIn(Boss, "Busi Boss", "082 555 8888");

// ---- Support page (signed in) ----
await U.goto(`${BASE}/you`);
await U.locator("[data-support-card]").filter({ visible: true }).click();
await U.waitForURL("**/support");
await U.getByLabel("Search help").fill("code");
await assert(await seen(U.locator("[data-help-results]").getByText("I didn't get my sign-in code")), "searching help finds answers");
await U.getByLabel("Search help").fill("");
await axe(U, "support");
await shot(U, "01-support");
const contact = U.locator("[data-contact-support]");
await contact.getByLabel("What's it about?").selectOption("payments");
await contact.getByLabel("What happened?").fill("I paid R59 with Capitec Pay but Afriheart+ didn't switch on.");
await U.locator("[data-support-shot]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
await assert(await seen(contact.getByRole("img", { name: "Your screenshot" })), "a screenshot can be added");
await contact.getByRole("button", { name: "Send to support" }).click();
await assert(await seen(U.locator("[data-support-sent]")), "the request is sent");
await U.getByRole("link", { name: "Open my ticket" }).click();
await assert(await seen(U.locator("[data-ticket-thread]").getByText("Capitec Pay")), "the ticket shows what they sent");

// ---- Support page (signed out, from sign-in) ----
await X.goto(`${BASE}/signin`);
await X.getByRole("link", { name: "Trouble signing in? Get help" }).click();
await X.waitForURL("**/support?topic=sign_in");
await X.locator("[data-contact-support]").getByLabel("Your name").fill("Gogo Dlamini");
await X.locator("[data-contact-support]").getByLabel("The mobile number you use for Afriheart").fill("083 555 7399");
await X.locator("[data-contact-support]").getByLabel("What happened?").fill("The code never arrives on my phone. I tried three times.");
await axe(X, "support-signed-out-dark");
await X.locator("[data-contact-support]").getByRole("button", { name: "Send to support" }).click();
await assert(await seen(X.locator("[data-support-sent]").getByText(/SMS or WhatsApp/)), "people who can't sign in can still ask for help");

// ---- Admin: who can get in ----
await U.goto(`${BASE}/admin`);
await assert(await seen(U.getByText("This page isn't here")) && !(await U.locator("[data-admin]").count()), "the admin area doesn't exist for normal people");
const api = await U.evaluate(async () => (await fetch("/api/admin/dashboard")).status);
await assert(api === 403, "admin APIs refuse normal people");

// ---- Admin: dashboard ----
await Boss.goto(`${BASE}/you`);
await Boss.locator("[data-admin-link]").filter({ visible: true }).click();
await Boss.waitForURL("**/admin");
await assert(await seen(Boss.locator("[data-kpi='People']")), "the dashboard shows people");
await assert(await seen(Boss.getByRole("button", { name: /Open support tickets/ }).getByText("2")), "…and open support tickets");
await axe(Boss, "admin-dashboard");
await shot(Boss, "02-admin-dashboard");

// ---- Support inbox ----
await Boss.getByRole("button", { name: "Support", exact: true }).click();
await Boss.locator("[data-support-inbox]").getByText("I paid R59 with Capitec Pay").click();
await assert(await seen(Boss.locator("[data-ticket-thread]").getByRole("img", { name: "Screenshot" })), "the team sees the screenshot");
await Boss.getByLabel("Reply to them").fill("Sorry about that, Unathi! We've switched Afriheart+ on and added 7 extra days.");
await Boss.getByRole("button", { name: "Send reply" }).click();
await assert(await seen(Boss.locator("[data-ticket-thread]").getByText("added 7 extra days")), "the reply is sent");
await axe(Boss, "admin-ticket");
await shot(Boss, "03-admin-ticket");
await Boss.getByRole("button", { name: "Mark solved" }).click();
await assert(await seen(Boss.getByText("Marked solved.")), "tickets can be solved");
await Boss.getByRole("button", { name: "Open their account" }).click();

// ---- People: gift Afriheart+ ----
await assert(await seen(Boss.locator("[data-person] h2").getByText("Unathi Mokoena")), "the account opens from the ticket");
await Boss.getByLabel("Reason for the gift").fill("Payment problem");
await Boss.locator("[data-person-actions]").getByRole("button", { name: "Give" }).click();
await assert(await seen(Boss.getByText(/Afriheart\+ until/)), "Afriheart+ days can be given");
await axe(Boss, "admin-person");
await shot(Boss, "04-admin-person");

// The person sees the reply.
await U.goto(`${BASE}/you`);
await assert(await seen(U.locator("[data-support-card]").getByText("1 new reply from the team")), "the person is told about the reply");
await U.goto(`${BASE}/support`);
await U.locator("[data-my-tickets]").getByRole("link").first().click();
await assert(await seen(U.getByText("Busi from Afriheart support")), "replies are signed with a first name");
await axe(U, "ticket");
await shot(U, "05-ticket");

// ---- Announcements ----
await assert(!(await U.locator("[data-announcement]").count()), "no banner shows when there's no announcement");
await Boss.goto(`${BASE}/admin?tab=announcements`);
await Boss.getByLabel("Announcement", { exact: true }).fill("Calls may drop tonight between 22:00 and 23:00 while we upgrade. Sorry!");
await Boss.getByRole("button", { name: "Show banner" }).click();
await assert(await seen(Boss.getByText("Everyone sees it now")), "a banner is posted");
await U.goto(BASE);
await assert(await seen(U.locator("[data-announcement]").getByText("Calls may drop tonight")), "everyone sees the banner");
await shot(U, "06-banner");
await U.locator("[data-announcement]").getByRole("button", { name: "Dismiss" }).click();
await U.reload();
await U.waitForTimeout(1200);
await assert(!(await U.locator("[data-announcement]").count()), "a dismissed banner stays away");

// ---- The team ----
await Boss.goto(`${BASE}/admin?tab=team`);
await Boss.locator("[data-team]").getByLabel(/Add someone/).fill("082 555 7303");
await Boss.locator("[data-team]").getByRole("button", { name: "Add" }).click();
await assert(await seen(Boss.locator("[data-team]").getByText("Hlengiwe Support")), "a support person is added");
await axe(Boss, "admin-team");
await H.goto(`${BASE}/admin`);
await assert(await seen(H.getByRole("button", { name: "Support", exact: true })), "support staff get the admin area");
await assert(!(await H.getByRole("button", { name: "Payments" }).count()), "…without payments");
await H.getByRole("button", { name: "People", exact: true }).click();
await H.getByLabel("Search people by name or number").fill("Unathi");
await assert(await seen(H.locator("[data-people]").getByText(/•••/)), "…and with numbers partly hidden");

// ---- Ban ----
await Boss.goto(`${BASE}/admin?tab=people`);
await Boss.getByLabel("Search people by name or number").fill("Vusi");
await Boss.locator("[data-people]").getByText("Vusi Trouble").click();
await Boss.getByLabel("Ban from Afriheart").fill("Scam messages to several people");
Boss.once("dialog", (d) => d.accept());
await Boss.getByRole("button", { name: "Ban", exact: true }).click();
await assert(await seen(Boss.getByText("Banned and signed out everywhere.")), "someone can be banned");
const vs = await V.evaluate(async () => (await fetch("/api/chats")).status);
await assert(vs === 401, "the banned person is signed out straight away");
await V.goto(`${BASE}/signin`);
await V.getByLabel("Your name").fill("Vusi Trouble");
await V.getByLabel("Mobile number").fill("082 555 7304");
await V.getByRole("button", { name: "Send me a code" }).click();
await assert(await seen(V.getByText(/can't use Afriheart/)), "…and can't sign in again (no code is sent)");

// ---- Payments, activity, leads ----
await Boss.goto(`${BASE}/admin?tab=payments`);
await assert(await seen(Boss.locator("[data-payments]")), "payments load");
await Boss.goto(`${BASE}/admin?tab=activity`);
for (const a of ["support reply", "grant plus", "announce", "set staff", "ban"]) await assert(await seen(Boss.locator("[data-activity]").getByText(a, { exact: true })), `the activity log records: ${a}`);
await axe(Boss, "admin-activity");
await shot(Boss, "07-admin-activity");
await Boss.goto(`${BASE}/admin?tab=leads`);
await assert(await seen(Boss.locator("[data-leads]")), "venue leads load");

// ---- Accessibility ----
let bad = 0;
for (const [name, list] of Object.entries(axeIssues)) {
  const serious = list.filter((v) => v.startsWith("serious") || v.startsWith("critical"));
  console.log(name, serious.length ? serious : "clean");
  bad += serious.length;
}
if (bad) throw new Error(`ASSERT: ${bad} serious accessibility issues`);
console.log("ALL ADMIN AND SUPPORT CHECKS PASSED");
await browser.close();
