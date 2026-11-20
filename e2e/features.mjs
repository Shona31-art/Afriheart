// Prompts and comment-to-like, voice prompts, today's most compatible, the hurtful-message check, double dates and "We met", end to end.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/features", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname, "utf8");
const log = (...a) => console.log("•", ...a);
const seen = (loc, timeout = 15000) => loc.filter({ visible: true }).first().waitFor({ timeout }).then(() => true, () => false);
const pages = [];
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

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera", "microphone"] };
const newPhone = async (extra = {}) => { const p = await (await browser.newContext({ ...phone, ...extra })).newPage(); pages.push(p); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };

async function signIn(p, name, number) {
  await p.goto(`${BASE}/signin`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  await p.getByRole("button", { name: "Send me a code" }).click();
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  await p.getByLabel("Code").fill(await p.locator("[data-test-code]").getAttribute("data-test-code"));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL("**/dating/profile");
}
async function profile(p, { photo, dob, gender, seeking, idea, city, gps }) {
  await p.locator("input[type=file]").setInputFiles(new URL(`./${photo}`, import.meta.url).pathname);
  await p.getByRole("img", { name: "Main photo" }).waitFor();
  await p.getByLabel("Date of birth").fill(dob);
  await p.getByText(gender, { exact: true }).click();
  await p.getByText(seeking, { exact: true }).click();
  if (city) await p.getByLabel("Or choose your city").selectOption(city);
  if (gps) {
    await p.getByRole("button", { name: "Use my location" }).click();
    await p.getByText(/Near where you are now/).waitFor();
  }
  await p.getByLabel("Your date idea").fill(idea);
  await p.getByRole("checkbox", { name: /I agree that Afriheart uses my profile/ }).check();
  await p.getByRole("button", { name: "Start meeting people" }).click();
  await p.waitForURL("**/discover");
}

const post = (p, url, data) => p.evaluate(async ([u, d]) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) }); return r.json(); }, [url, data]);
const get = (p, url) => p.evaluate(async (u) => (await fetch(u)).json(), url);
const answers = { looking: { a: "long", ok: ["long"], imp: 3 }, kids: { a: "want", ok: ["want"], imp: 3 }, smoke: { a: "never", ok: ["never"], imp: 3 }, drink: { a: "social", ok: ["social"], imp: 2 }, texting: { a: "few", ok: ["few"], imp: 2 } };
async function answerAll(p) { for (const [question, v] of Object.entries(answers)) await post(p, "/api/dating/answers", { question, ...v }); }

// Ayesha: profile with a prompt and a voice prompt
const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 9101");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks in Umhlanga", city: "Durban" });
await A.goto(`${BASE}/dating/profile`);
await A.getByLabel("Prompt 1", { exact: true }).selectOption({ label: "My ideal Sunday" });
await A.getByLabel("Your answer to My ideal Sunday").fill("Morning market, beach walk, then a very long nap");
await A.getByLabel("Prompt 2", { exact: true }).selectOption({ label: "A green flag I look for" });
await A.getByLabel("Your answer to A green flag I look for").fill("You text back and you're kind to waiters");
await A.getByLabel("Voice prompt question").selectOption({ label: "I'll make you laugh by" });
await A.getByRole("button", { name: "Record", exact: true }).click();
await A.waitForTimeout(2500);
await A.getByRole("button", { name: /^Stop/ }).click();
await assert(await seen(A.getByRole("button", { name: "Record again" }), 15000), "a voice prompt is recorded and uploaded");
await shot(A, "01-profile-prompts"); await axe(A, "profile-prompts");
await A.getByRole("button", { name: "Save profile" }).click();
await A.waitForURL("**/discover");
await answerAll(A);
const mine = await get(A, "/api/dating/profile");
await assert(mine.prompts.length === 2 && mine.voice_path && mine.voice_prompt === "laugh", "prompts and voice prompt are saved");

// Sipho and Thabo
const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 9102");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk on the promenade", city: "Durban" });
await answerAll(S);
const T = await newPhone();
await signIn(T, "Thabo Nkosi", "084 555 9103");
await profile(T, { photo: "p-kyle.jpg", dob: "1993-02-02", gender: "Man", seeking: "Women", idea: "Jazz night", city: "Durban" });
await post(T, "/api/dating/answers", { question: "looking", a: "casual", ok: ["casual"], imp: 3 });
for (const q of ["kids", "smoke", "drink", "texting"]) await post(T, "/api/dating/answers", { question: q, ...answers[q] });

// Sipho sees her prompts and voice prompt, and comments on a prompt
await S.goto(`${BASE}/discover`);
const her = S.getByRole("article", { name: /Ayesha/ }).filter({ visible: true });
await assert(await seen(her.locator('[data-prompt="sunday"]')) && await seen(her.getByText("Morning market, beach walk, then a very long nap")), "Discover shows her prompts");
await assert(await seen(her.locator("[data-voice-prompt]")), "and her voice prompt");
await S.locator("[data-card-details]").filter({ visible: true }).first().evaluate((el) => el.scrollTo(0, 0));
await shot(S, "02-discover-prompts"); await axe(S, "discover-prompts");
await S.getByRole("button", { name: "Like Ayesha's answer to My ideal Sunday" }).click();
const sheet = S.getByRole("dialog", { name: /Like Ayesha's answer/ });
await sheet.getByLabel(/Add a comment/).fill("you're so ugly");
await sheet.getByRole("button", { name: "Send like" }).click();
await assert(await seen(sheet.getByText(/Are you sure\?/)), "a hurtful comment gets an \"Are you sure?\" first");
await sheet.getByLabel(/Add a comment/).fill("Which market? I'm a Sunday market person too");
await shot(S, "03-like-sheet"); await axe(S, "like-sheet");
await sheet.getByRole("button", { name: "Send like" }).click();
await assert(!(await S.getByRole("dialog").count()) || await seen(S.getByRole("article").filter({ visible: true }).or(S.getByText("You've seen everyone for now"))), "the like with a comment is sent");

// Ayesha: today's most compatible (Sipho), with his comment
await A.goto(`${BASE}/discover`);
const sip = A.getByRole("article", { name: /Sipho/ }).filter({ visible: true });
await assert(await seen(sip), "Sipho is first in Ayesha's Discover");
await assert(await seen(sip.locator("[data-daily-pick]")), "marked as today's most compatible (he beats Thabo on match %)");
await assert(await seen(sip.locator("[data-liked-you]").getByText(/Sipho liked your answer to "My ideal Sunday"/)) && await seen(sip.getByText(/Which market\?/)), "his like and comment show on his card");
await shot(A, "04-discover-pick"); await axe(A, "discover-pick");
await A.getByRole("button", { name: /^Like Sipho/ }).click();
await A.getByRole("dialog", { name: "It's a match" }).waitFor();
await A.getByRole("button", { name: /Send Sipho a message/ }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();
const chatId = new URL(chatUrl).pathname.split("/")[2];
await assert(await seen(A.locator("[data-like-card]").getByText(/Sipho liked Ayesha's answer to "My ideal Sunday"/)) && await seen(A.locator("[data-like-card]").getByText(/Which market\?/)), "the chat opens with what he liked and his comment");

// Hurtful message check, on the phone
await S.goto(chatUrl);
await S.getByLabel("Message", { exact: true }).filter({ visible: true }).first().fill("you're a loser");
await S.getByRole("button", { name: "Send", exact: true }).filter({ visible: true }).first().click();
await assert(await seen(S.getByText(/Are you sure\?/)), "sending a hurtful message asks \"Are you sure?\"");
await shot(S, "05-are-you-sure"); await axe(S, "are-you-sure");
await S.getByRole("button", { name: "Send anyway" }).click();
await assert(await seen(A.locator("[data-hurtful]").getByText("Does this bother you?"), 20000), "Ayesha sees it blurred: \"Does this bother you?\"");
await shot(A, "06-does-this-bother-you"); await axe(A, "bother");
await A.locator("[data-hurtful]").getByRole("button", { name: "Report" }).click();
const rep = A.getByRole("dialog", { name: /Report Sipho/ });
await assert((await rep.getByLabel("What happened? (optional)").inputValue()).includes("you're a loser"), "reporting fills in the message so the team can see it");
await rep.getByRole("button", { name: "Cancel" }).click();
await A.locator("[data-hurtful]").getByRole("button", { name: "Show message" }).click();
await assert(await seen(A.getByText("you're a loser")), "and she can choose to read it");

// We met: after a date (an alphabet date ticked off)
await A.goto(`${chatUrl}/az`);
await A.getByRole("button", { name: "Fill in A" }).click();
await A.getByRole("dialog").getByLabel("Photo for A").setInputFiles(new URL("./az-aquarium.jpg", import.meta.url).pathname);
await seen(A.locator('article[data-az="A"]').getByRole("img", { name: "Your Aquarium date" }), 20000);
await A.goto(chatUrl);
await assert(await seen(A.getByRole("heading", { name: "Did you meet Sipho?" })), "after the date, \"Did you meet Sipho?\"");
await shot(A, "07-we-met"); await axe(A, "we-met");
await A.getByRole("button", { name: "Yes, we met" }).click();
await A.locator("[data-we-met]").getByText("Yes", { exact: true }).first().click();
await A.locator("[data-we-met] fieldset").nth(1).getByText("No", { exact: true }).click();
await A.getByRole("button", { name: "Send privately" }).click();
await assert(await seen(A.getByText("Thanks! This helps keep Afriheart real.")), "answered privately");
await S.goto(chatUrl);
await assert(!(await S.getByText(/Ayesha said|didn't look like/).count()), "Sipho never sees her answers");

// Double dates: Ayesha + Bea vs Cal + Dan
await A.goto(`${BASE}/discover`);
await A.getByRole("tab", { name: "Double date" }).click();
await A.getByLabel("A date for four").fill("Bowling, then burgers");
await A.getByRole("button", { name: "Invite a friend" }).click();
const invite = await A.locator("[data-duo-link]").getAttribute("data-duo-link", { timeout: 15000 });
await assert(invite.includes("/dating/double/"), "Ayesha gets an invite link for a friend");
await shot(A, "08-double-invite"); await axe(A, "double-invite");
const B = await newPhone();
await signIn(B, "Bea Pillay", "085 555 9104");
await profile(B, { photo: "p-ayesha2.jpg", dob: "1996-06-06", gender: "Woman", seeking: "Men", idea: "Brunch", city: "Durban" });
await B.goto(invite);
await assert(await seen(B.getByRole("heading", { name: "Ayesha wants to double date with you" })), "Bea opens the invite");
await B.getByRole("button", { name: "Pair up with Ayesha" }).click();
await B.waitForURL("**/discover?mode=double");
const C = await newPhone();
await signIn(C, "Cal Moodley", "086 555 9105");
await profile(C, { photo: "p-sipho.jpg", dob: "1995-01-01", gender: "Man", seeking: "Women", idea: "Surfing", city: "Durban" });
const D = await newPhone();
await signIn(D, "Dan Botha", "087 555 9106");
await profile(D, { photo: "p-kyle.jpg", dob: "1994-04-04", gender: "Man", seeking: "Women", idea: "Hike", city: "Durban" });
const cd = await post(C, "/api/dating/duo", { idea: "Karaoke night" });
await post(D, "/api/dating/duo/join", { code: cd.duo.code });
await B.goto(`${BASE}/discover?mode=double`);
await assert(await seen(B.getByRole("article", { name: /Pair: (Cal|Dan).* and (Cal|Dan)/ }).filter({ visible: true })), "Bea sees Cal and Dan as a pair");
await B.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
await shot(B, "09-double-card"); await axe(B, "double-card");
await B.getByRole("button", { name: /^Like (Cal|Dan) and/ }).click();
await D.goto(`${BASE}/discover?mode=double`);
await D.getByRole("button", { name: /^Like (Ayesha|Bea) and/ }).click();
await assert(await seen(D.getByRole("dialog", { name: "It's a double date!" })), "a mutual like: it's a double date");
await D.getByRole("button", { name: "Open the chat" }).click();
await D.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
await assert(await seen(D.getByText(/It's a double date!/)) && await seen(D.getByText(/Here's a plan for/)), "a chat for four opens, with a plan");
await shot(D, "10-double-chat");
const thread = await get(D, `/api/chats/${new URL(D.url()).pathname.split("/")[2]}`);
await assert(thread.members.length === 4 && thread.members.filter((m) => m.name !== "Dan Botha").every((m) => m.phone === ""), "four people, phone numbers hidden");

// The team sees the We met report and the count
const TM = await newPhone();
await signIn(TM, "Thandi (Afriheart team)", "082 555 9999");
await TM.goto(`${BASE}/team`);
await TM.getByRole("tab", { name: /Reports/ }).click();
await assert(await seen(TM.getByText(/didn't look like their photos/)), "\"didn't look like their photos\" reaches the team");
await assert(await seen(TM.locator("[data-we-met-stats]").getByText(/1 dates confirmed/)), "and the team sees how many dates happened");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL FEATURE CHECKS PASSED");
await browser.close();
