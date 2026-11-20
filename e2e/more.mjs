// Friends vouch for you, Afriheart+ (test checkout), Likes you, Couple space, data-light mode and
// date deals (coming soon), on simulated phones.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/more", import.meta.url).pathname;
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
const shot = async (p, n, full = false) => { await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const axeIssues = {};
async function axe(p, name) {
  await p.addScriptTag({ content: AXE });
  axeIssues[name] = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`));
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone", "camera", "clipboard-read", "clipboard-write"] };
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

async function makeProfile(p, { photos, dob, gender, seeking, area, bio, idea }) {
  await p.goto(`${BASE}/dating/profile`);
  // Pick the photo once the page is ready (a file chosen before then is ignored, as on a real phone).
  for (let i = 0; i < 5; i++) {
    await p.waitForTimeout(800);
    await p.locator("input[type=file]").setInputFiles(photos.map((f) => new URL(`./${f}`, import.meta.url).pathname));
    if (await p.getByRole("img", { name: "Main photo" }).waitFor({ timeout: 4000 }).then(() => true, () => false)) break;
  }
  await p.getByLabel("Date of birth").fill(dob);
  await p.getByText(gender, { exact: true }).click();
  await p.getByLabel("Area").fill(area);
  await p.getByLabel("About you").fill(bio);
  for (const s of seeking) await p.getByText(s, { exact: true }).click();
  await p.getByLabel("From", { exact: true }).fill("21");
  await p.getByLabel("To", { exact: true }).fill("40");
  await p.getByLabel("Your date idea").fill(idea);
  await p.getByRole("checkbox", { name: /I agree that Afriheart uses my profile/ }).check();
  await p.getByRole("button", { name: "Start meeting people" }).click();
  await p.waitForURL("**/discover");
}

const A = await newPhone();
const S = await newPhone({ colorScheme: "dark" });
await signIn(A, "Ayesha Khan", "082 555 7101");
await makeProfile(A, { photos: ["p-ayesha.jpg"], dob: "1997-03-14", gender: "Woman", seeking: ["Men"], area: "Morningside, Durban", bio: "Architect, coffee snob.", idea: "Sunset drinks in Umhlanga" });
await signIn(S, "Sipho Ndlovu", "083 555 7202");
await makeProfile(S, { photos: ["p-sipho.jpg"], dob: "1994-08-02", gender: "Man", seeking: ["Women"], area: "Berea, Durban", bio: "Chef by day.", idea: "Bunny chow crawl" });

// ---- Small photo copies for data-light mode ----
const aPhoto = await A.evaluate(async () => (await (await fetch("/api/dating/profile")).json()).photos?.[0]);
const sizes = await A.evaluate(async (p) => {
  const full = (await (await fetch(`/api/dating/photos/${p}`)).arrayBuffer()).byteLength;
  const small = (await (await fetch(`/api/dating/photos/${p}?size=small`)).arrayBuffer()).byteLength;
  return { full, small };
}, aPhoto);
await assert(sizes.small > 0 && sizes.small < sizes.full / 2, `a small copy is stored for data-light mode (${Math.round(sizes.small / 1024)} KB vs ${Math.round(sizes.full / 1024)} KB)`);

// ---- 1. Friends vouch for you ----
await A.goto(`${BASE}/you`);
await assert(await seen(A.locator("[data-vouch-manager]")), "You tab has Friends vouch for you");
await A.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
await A.getByRole("button", { name: "Ask a friend to vouch" }).click();
await assert(await seen(A.getByText(/Link copied|Send this link to a friend/)), "asking makes a link to send");
const link = await A.evaluate(async () => (await navigator.clipboard.readText()).match(/https?:\/\/\S+\/vouch\/\S+/)?.[0]);
await assert(!!link, `the link is ready to paste (${link?.replace(/vouch\/.*/, "vouch/…")})`);

const F = await newPhone();
await F.goto(link);
await assert(await seen(F.getByRole("heading", { name: "Vouch for Ayesha" })), "the friend opens the link");
await F.getByRole("link", { name: "Sign in to vouch" }).click();
await F.getByLabel("Your name").fill("Zanele Dube");
await F.getByLabel("Mobile number").fill("084 555 7303");
await F.getByRole("button", { name: "Send me a code" }).click();
await F.waitForURL((u) => u.searchParams.get("step") === "code");
await F.getByLabel("Code").fill(await F.locator("[data-test-code]").getAttribute("data-test-code"));
await F.getByRole("button", { name: "Verify" }).click();
await F.waitForURL("**/vouch/**");
await assert(await seen(F.getByLabel("Your vouch")), "after signing in, the friend is back on the vouch page");
await shot(F, "01-vouch-form"); await axe(F, "vouch-form");
await F.getByText("Friend", { exact: true }).click();
await F.getByLabel("Your vouch").fill("She is such a loser");
await F.getByRole("button", { name: "Vouch for Ayesha" }).click();
await assert(await seen(F.getByRole("alert").filter({ hasText: "kind and true" })), "an unkind vouch is refused");
await F.getByLabel("Your vouch").fill("Most loyal person I know. Ayesha remembers every birthday and plans the best picnics in Durban.");
await F.getByRole("button", { name: "Vouch for Ayesha" }).click();
await assert(await seen(F.getByText("Thank you!")), "the vouch is sent");

await A.reload();
await assert(await seen(A.getByText("1 new vouch to look at")), "Ayesha sees a new vouch waiting");
await shot(A, "02-vouch-waiting"); await axe(A, "you-tab");
// Not approved yet: Sipho doesn't see it.
await S.goto(`${BASE}/discover`);
await assert(await seen(S.getByRole("article", { name: /Ayesha/ })), "Sipho sees Ayesha in Discover");
await assert((await S.locator("[data-vouches]").count()) === 0, "the vouch doesn't show before Ayesha approves it");
await A.getByRole("button", { name: "Show on my profile" }).click();
await assert(await seen(A.getByText("On your profile")), "Ayesha approves it");
await S.reload();
await assert(await seen(S.locator("[data-vouches]").getByText(/Most loyal person I know/)), "now Sipho sees what her friend says");
await assert(await seen(S.locator("[data-vouches]").getByText("Zanele, friend")), "with the friend's first name only");
await S.locator("[data-card-details]").evaluate((e) => e.scrollTo(0, e.scrollHeight));
await shot(S, "03-vouch-on-card-dark");

// ---- 2. Likes you (Afriheart+) ----
await Promise.all([S.waitForResponse((r) => r.url().includes("/api/dating/swipe")), S.getByRole("button", { name: "Like Ayesha", exact: true }).click()]);
await A.goto(`${BASE}/dating/likes`);
await assert(await seen(A.getByText("1 person likes you")), "Ayesha sees that one person likes her");
await assert((await A.locator("[data-like-card]").count()) === 0, "without Afriheart+, not who");
await shot(A, "04-likes-locked"); await axe(A, "likes-locked");
await A.getByRole("link", { name: "See who with Afriheart+" }).click();
await A.waitForURL("**/plus");
await assert(await seen(A.getByRole("heading", { name: /Afriheart/ })), "the Afriheart+ page opens");
await assert(await seen(A.getByText(/Capitec Pay/)), "local ways to pay are listed");
await assert(await seen(A.getByText("R59", { exact: true })), "a month is R59");
await shot(A, "05-plus", true); await axe(A, "plus");
await A.getByText("1 week", { exact: true }).click();
await A.getByRole("button", { name: "Pay R19" }).click();
await A.waitForURL("**/plus/test-checkout**");
await A.getByRole("button", { name: "Pay (test)" }).click();
await A.waitForURL("**/plus?paid=**");
await assert(await seen(A.getByText("Payment received, thank you!")), "the payment is confirmed");
await assert(await seen(A.locator("[data-plus-active]")), "Afriheart+ is on");
await A.goto(`${BASE}/dating/likes`);
await assert(await seen(A.locator("[data-like-card]").getByText(/Sipho, \d+/)), "with Afriheart+, Ayesha sees Sipho");
await shot(A, "06-likes-plus"); await axe(A, "likes-plus");
await A.getByRole("button", { name: "Match with Sipho" }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();
await assert(await seen(A.getByText("You matched with each other")), "liking back matches them straight away");

// ---- 3. Talking cards: Plus decks open for both ----
await S.goto(`${chatUrl}/cards`);
await assert(await seen(S.getByRole("button", { name: /^Flirty/ })), "Sipho sees the Flirty deck");
await assert((await S.getByRole("button", { name: /^Flirty/ }).getByText("Plus").count()) === 0, "it's open for him because Ayesha has Afriheart+");
await S.getByRole("button", { name: /^Flirty/ }).click();
await assert(await seen(S.getByText("Flirty · card 1 of 30")), "Sipho deals Flirty without paying");

// ---- 4. Couple space ----
await A.goto(chatUrl);
await A.getByRole("button", { name: "Photo, plan, cards and more" }).click();
await A.getByRole("link", { name: "Couple space" }).click();
await A.waitForURL("**/us");
await assert(await seen(A.locator("[data-question-of-the-day]")), "Couple space shows today's question");
const q = (await A.locator("[data-question-of-the-day] .display").textContent()).trim();
await A.getByLabel("Your answer").fill("Bunny chow on the beach, obviously");
await A.getByRole("button", { name: "Answer", exact: true }).click();
await assert(await seen(A.locator("[data-my-answer]").getByText("Bunny chow on the beach, obviously")), "Ayesha's answer is saved (and readable on her phone)");
await assert(await seen(A.getByText("Waiting for Sipho to answer.")), "Sipho's answer is hidden until he answers");
await S.goto(`${chatUrl}/us`);
await assert(await seen(S.getByText("Ayesha has answered. Answer to see what they said.")), "Sipho can't see her answer before answering");
await assert((await S.getByText("Bunny chow on the beach").count()) === 0, "her answer isn't on his screen yet");
await S.getByLabel("Your answer").fill("Your laugh at my terrible jokes");
await S.getByRole("button", { name: "Answer", exact: true }).click();
await assert(await seen(S.locator("[data-their-answer]").getByText("Bunny chow on the beach, obviously")), "after answering, Sipho sees Ayesha's answer (decrypted on his phone)");
await assert(await seen(A.locator("[data-their-answer]").getByText("Your laugh at my terrible jokes"), 6000), "and Ayesha sees his, live");
await assert(await seen(A.locator("[data-days-together]")), "days together shows");
await shot(A, "07-couple-space", true); await axe(A, "couple-space");
await shot(S, "08-couple-space-dark", true);
const db = readFileSync(process.env.DB || "/tmp/common-more.json", "utf8");
await assert(!db.includes("Bunny chow on the beach") && !db.includes("terrible jokes"), "answers are end-to-end encrypted: not readable in the database");
await A.goto(chatUrl);
await assert(await seen(A.getByText("You've both answered today's question.")), "the chat gets a note (without the answers)");
void q;

// ---- 5. Data-light mode ----
await A.goto(`${BASE}/you`);
await A.locator("[data-light-settings]").filter({ visible: true }).getByText("Always on").click();
await assert(await seen(A.locator("[data-light-settings]").filter({ visible: true }).getByText("On now")), "data-light mode turns on");
await assert(await seen(A.locator("[data-usage]").filter({ visible: true }).getByText(/(KB|MB) used by Afriheart on this phone this week/)), "the data meter shows this week's use");
await A.locator("[data-light-settings]").filter({ visible: true }).scrollIntoViewIfNeeded();
await shot(A, "09-data-light"); await axe(A, "data-light");
// A photo in the chat waits for a tap; profile photos load the small copy.
await S.goto(chatUrl);
await S.getByRole("button", { name: "Photo, plan, cards and more" }).click();
await S.locator('section[aria-label="Write a message"]').filter({ visible: true }).locator("[data-photo-input]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
await S.getByRole("button", { name: "Send photo" }).click();
await A.goto(chatUrl);
await assert(await seen(A.locator("[data-light-photo]")), "in data-light mode, a chat photo waits for a tap");
await A.locator("[data-light-photo]").first().click();
await assert(await seen(A.getByRole("button", { name: "Open photo" })), "tapping loads it");
const smallReq = A.waitForRequest((r) => r.url().includes("/api/dating/photos/") && r.url().includes("size=small"), { timeout: 8000 }).then(() => true, () => false);
await A.goto(`${chatUrl}/info`).catch(() => undefined);
await assert(await smallReq, "profile photos load the small copy in data-light mode");

// ---- 6. Date deals and events: coming soon ----
await A.goto(`${BASE}/plans`);
await A.getByRole("link", { name: /Date deals and events/ }).click();
await A.waitForURL("**/deals");
await assert(await seen(A.getByText("Coming soon").first()), "deals and events are marked coming soon");
await A.getByLabel("Your city or town").fill("Durban");
await A.getByRole("button", { name: "Notify me" }).click();
await assert(await seen(A.getByText("You're on the list for Durban.")), "people can ask to be told when it opens");
await A.getByLabel("Venue name").fill("Afro's Chicken Shop");
await A.getByLabel("City or town", { exact: true }).fill("Durban");
await A.getByLabel("Email or phone").fill("hello@example.co.za");
await A.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(A.getByText("The Afriheart team will contact you.")), "venues can put their hand up");
await shot(A, "10-deals-soon", true); await axe(A, "deals");

for (const [k, v] of Object.entries(axeIssues)) console.log(k, v.length ? v.join("  ;  ") : "clean");
const bad = Object.values(axeIssues).flat().filter((v) => v.startsWith("serious") || v.startsWith("critical"));
await browser.close();
if (bad.length) { console.log("serious accessibility issues:", bad.length); process.exit(1); }
console.log("ALL NEW FEATURE CHECKS PASSED");
