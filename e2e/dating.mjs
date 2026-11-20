// Dating end to end on simulated phones: profiles, Discover, a match via a date idea, a private chat with a plan, block, report, unmatch.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/dating", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname, "utf8");
const log = (...a) => console.log("•", ...a);
const seen = (loc, timeout = 15000) => loc.filter({ visible: true }).first().waitFor({ timeout }).then(() => true, () => false);
let pages = [];
const assert = async (c, m) => {
  if (!c) {
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}/FAIL-${i}.png` }).catch(() => {});
    throw new Error("ASSERT: " + m);
  }
  log("ok:", m);
};
const shot = async (p, n) => { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/${n}.png` }); };
const axeIssues = {};
async function axe(p, name) {
  await p.addScriptTag({ content: AXE });
  axeIssues[name] = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.impact}:${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(" ")}`));
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone", "camera"] };
const newPhone = async () => { const p = await (await browser.newContext(phone)).newPage(); pages.push(p); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };

async function signIn(p, name, number) {
  await p.goto(`${BASE}/signin`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  await p.getByRole("button", { name: "Send me a code" }).click();
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  await p.getByLabel("Code").fill(await p.locator("[data-test-code]").getAttribute("data-test-code"));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

async function makeProfile(p, { photos, dob, gender, seeking, area, bio, idea, ageMin = 21, ageMax = 40 }) {
  await p.waitForURL("**/dating/profile");
  await p.locator("input[type=file]").setInputFiles(photos.map((f) => new URL(`./${f}`, import.meta.url).pathname));
  await p.getByRole("img", { name: "Main photo" }).waitFor();
  await p.getByLabel("Date of birth").fill(dob);
  await p.getByText(gender, { exact: true }).click();
  await p.getByLabel("Area").fill(area);
  await p.getByLabel("About you").fill(bio);
  for (const s of seeking) await p.getByText(s, { exact: true }).click();
  await p.getByLabel("From", { exact: true }).fill(String(ageMin));
  await p.getByLabel("To", { exact: true }).fill(String(ageMax));
  if (idea) await p.getByLabel("Your date idea").fill(idea);
  else await p.getByRole("button", { name: "Sunrise walk on the promenade, then coffee" }).click();
  await p.getByRole("checkbox", { name: /I agree that Afriheart uses my profile/ }).check();
  await p.getByRole("button", { name: "Start meeting people" }).click();
  await p.waitForURL("**/discover");
}

// 1. Ayesha and Sipho sign in and are sent to make a profile
const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 9101");
await assert(await A.waitForURL("**/dating/profile", { timeout: 10000 }).then(() => true, () => false), "a new person lands on making their dating profile");
await shot(A, "01-profile-empty"); await axe(A, "profile-editor");
await A.getByRole("button", { name: "Start meeting people" }).click();
await assert(await seen(A.getByRole("alert")) || (await A.locator("input:invalid").count()) > 0, "the profile can't be saved empty");
await makeProfile(A, { photos: ["p-ayesha.jpg", "p-ayesha2.jpg"], dob: "1997-03-14", gender: "Woman", seeking: ["Men"], area: "Morningside, Durban", bio: "Architect, coffee snob, bad at karaoke but committed to it.", idea: "Sunset drinks in Umhlanga" });
await assert(await seen(A.getByText("You've seen everyone for now")), "with nobody else yet, Discover says so");

// Under-18 is refused by the server even if the form is bypassed
const minor = await A.evaluate(async () => (await fetch("/api/dating/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ display_name: "Kid", birthdate: "2010-01-01", gender: "woman", interested_in: ["men"], age_min: 18, age_max: 30, photos: [], date_idea: "Walk", consent: true }) })).json());
await assert(minor.error === "You must be 18 or older to use Afriheart.", "under-18s are refused by the server");

const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 9202");
await makeProfile(S, { photos: ["p-sipho.jpg"], dob: "1994-08-02", gender: "Man", seeking: ["Women"], area: "Berea, Durban", bio: "Chef by day, 5-a-side legend by night (self-declared).", idea: "" });

const K = await newPhone();
await signIn(K, "Kyle Naidoo", "084 555 9303");
await makeProfile(K, { photos: ["p-kyle.jpg"], dob: "1996-11-30", gender: "Man", seeking: ["Women"], area: "Umhlanga", bio: "Surfer. Will teach you to stand on a board, no promises.", idea: "Learn to surf at North Beach" });

// 2. Ayesha discovers Sipho and Kyle
await A.reload();
await assert(await seen(A.getByRole("article", { name: /Sipho, 32|Kyle, 29/ })), "Ayesha sees men who want to meet women in her age range");
await shot(A, "02-discover"); await axe(A, "discover");
const phoneLeak = await A.locator("body").innerText();
await assert(!/555 9202|555 9303|27835559202/.test(phoneLeak), "no phone numbers on Discover");

// Ayesha blocks Kyle via report
const kyleFirst = await seen(A.getByRole("article", { name: /Kyle/ }), 3000);
if (!kyleFirst) await A.getByRole("button", { name: /^Pass on Sipho/ }).click().catch(() => {});
await A.getByRole("button", { name: /More options for Kyle/ }).click();
await A.getByRole("button", { name: /Report or block Kyle/ }).click();
await shot(A, "03-report");
await A.getByLabel("Asking for money or a scam").check();
await A.getByLabel("What happened? (optional)").fill("Asked me for airtime");
await A.getByRole("button", { name: "Report and block" }).click();
await assert(await seen(A.getByRole("article", { name: /Sipho/ }).or(A.getByText("You've seen everyone for now"))), "the reported person disappears");
await K.reload();
await assert(await seen(K.getByText("You've seen everyone for now")), "a blocked person can no longer see the person who blocked them");
const db = JSON.parse(readFileSync(process.env.DB || "/tmp/common-p.json", "utf8"));
await assert(db.reports.length === 1 && db.reports[0].reason === "scam" && db.blocks.length === 1, "the report is saved for the team and Kyle is blocked");
const aPhoto = db.dating_profiles.find((p) => p.display_name === "Ayesha").photos[0];
const kyleSeesPhoto = await K.evaluate(async (p) => (await fetch(`/api/dating/photos/${p}`, { cache: "no-store" })).status, aPhoto);
await assert(kyleSeesPhoto === 404, "a blocked person can't load the other person's photos");

// 3. If Sipho was passed above, reset by starting over isn't possible, so make sure he's still on screen
if (!(await seen(A.getByRole("article", { name: /Sipho/ }), 3000))) throw new Error("Sipho should still be in Ayesha's Discover");
await A.getByRole("button", { name: /Yes to the date with Sipho/ }).click();
await assert(await seen(A.getByText("You've seen everyone for now")), "after answering, Ayesha's stack is empty (no match yet)");

// 4. Sipho likes Ayesha back → match
await S.reload();
await assert(await seen(S.getByRole("article", { name: /Ayesha, 29/ })), "Sipho sees Ayesha (she said yes to his date, so she's shown first)");
await S.getByRole("button", { name: /Next photo/ }).click();
await assert(await seen(S.getByRole("img", { name: /Photo 2 of 2 of Ayesha/ })), "Sipho can flip through her photos");
await S.getByRole("button", { name: /^Like Ayesha/ }).click();
await assert(await seen(S.getByRole("dialog", { name: "It's a match" })), "It's a match");
await shot(S, "04-match"); await axe(S, "match-dialog");
await S.getByRole("button", { name: /Send Ayesha a message/ }).click();
await S.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = S.url();
const sub = S.locator("[data-chat-subtitle]").filter({ visible: true }).first();
await sub.waitFor();
const subText = await sub.textContent();
await assert(/Matched on Afriheart|online|last seen/.test(subText) && !/\+27|\d{3} \d{4}/.test(subText), `the chat header shows "${subText.split(":")[0]}", never a phone number`);
await assert(await seen(S.getByText(/You both said yes to "Sunrise walk on the promenade, then coffee"/), 20000), "Afriheart turned Sipho's date idea into a plan in the chat");
await assert(await seen(S.getByRole("article", { name: /Plan:/ })), "the plan card is in the chat");
await S.getByLabel("Message", { exact: true }).fill("Hey Ayesha! Sunrise walk this Saturday? ☕");
await S.getByRole("button", { name: "Send", exact: true }).click();
await shot(S, "05-match-chat"); await axe(S, "match-chat");

// 5. Ayesha gets the chat (encrypted), with no phone numbers anywhere
await A.goto(`${BASE}/`);
await assert(await seen(A.getByText("Sipho Mthembu")), "the match is in Ayesha's chats");
await A.goto(chatUrl);
await assert(await seen(A.getByText("Hey Ayesha! Sunrise walk this Saturday?")), "Ayesha reads Sipho's encrypted message");
const dbNow = readFileSync(process.env.DB || "/tmp/common-p.json", "utf8");
await assert(!dbNow.includes("Hey Ayesha!"), "the server only has the scrambled message");
await A.goto(`${chatUrl}/info`);
await assert(await seen(A.getByText("Sipho, 32")) && await seen(A.getByText(/Date idea:/)), "match info shows his profile and date idea");
const infoText = await A.locator("body").innerText();
await assert(!/\+27|555 9202/.test(infoText), "match info never shows his phone number");
await shot(A, "06-match-info"); await axe(A, "match-info");

// 6. Safety page
await A.goto(`${BASE}/dating/safety`);
await assert(await seen(A.getByText("Never send money")), "the safety page explains scams");
await shot(A, "07-safety"); await axe(A, "safety");

// 7. Ayesha unmatches: the chat disappears for both
await A.goto(`${chatUrl}/info`);
A.once("dialog", (d) => d.accept());
await A.getByRole("button", { name: "Unmatch" }).click();
await A.waitForURL((u) => u.pathname === "/");
await S.goto(`${BASE}/`);
await S.waitForTimeout(1500);
await assert(!(await S.getByText("Ayesha Khan").count()), "after unmatching, the chat is gone for Sipho too");
const after = await S.evaluate(async (u) => (await fetch(u.replace(/^.*\/chats\//, "/api/chats/"))).status, chatUrl);
await assert(after === 400, "and the chat can't be opened any more");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL DATING CHECKS PASSED");
await browser.close();
