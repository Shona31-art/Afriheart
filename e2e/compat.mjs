// Compatibility questions end to end: answer, see match % on Discover, ranking, privacy of answers, match info.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/compat", import.meta.url).pathname;
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

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const newPhone = async () => { const p = await (await browser.newContext(phone)).newPage(); pages.push(p); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };

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
async function profile(p, { photo, dob, gender, seeking, idea }) {
  await p.locator("input[type=file]").setInputFiles(new URL(`./${photo}`, import.meta.url).pathname);
  await p.getByRole("img", { name: "Main photo" }).waitFor();
  await p.getByLabel("Date of birth").fill(dob);
  await p.getByText(gender, { exact: true }).click();
  await p.getByText(seeking, { exact: true }).click();
  await p.getByLabel("Your date idea").fill(idea);
  await p.getByRole("checkbox", { name: /I agree that Afriheart uses my profile/ }).check();
  await p.getByRole("button", { name: "Start meeting people" }).click();
  await p.waitForURL("**/discover");
}
/** Answer through the API (the UI flow is exercised once below). */
async function answerAll(p, list) {
  for (const [question, a, ok, imp] of list) {
    const r = await p.evaluate(async (b) => (await fetch("/api/dating/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).status, { question, a, ok, imp });
    if (r !== 200) throw new Error(`answer ${question} failed ${r}`);
  }
}

const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 7301");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks in Umhlanga" });
await assert(await seen(A.getByText(/See your match %/)), "Discover invites Ayesha to answer the questions");

// Ayesha answers the first questions through the screens
await A.getByRole("link", { name: /See your match %/ }).filter({ visible: true }).first().click();
await A.waitForURL("**/dating/questions");
await shot(A, "01-question"); await axe(A, "questions");
await assert(await seen(A.getByText("Question 1 of 12")), "one question at a time, with progress");
await A.getByRole("radio", { name: "Something long-term" }).check();
await A.getByRole("checkbox", { name: "Something long-term" }).check({ force: true });
await A.getByRole("radio", { name: "Very" }).check({ force: true });
await A.getByRole("button", { name: "Next" }).click();
await assert(await seen(A.getByText("Question 2 of 12")), "answer saved, on to question 2");
await A.getByRole("radio", { name: "I want kids someday" }).check();
await A.getByRole("radio", { name: "Somewhat" }).check({ force: true });
await A.getByRole("button", { name: "Next" }).click();
await A.getByRole("button", { name: "Skip" }).click();
await assert(await seen(A.getByText("Question 4 of 12")), "questions can be skipped");
await answerAll(A, [
  ["smoke", "never", ["never"], 3], ["drink", "social", null, 1], ["weekend", "active", null, 1],
  ["texting", "few", null, 2], ["planning", "plan", null, 1], ["meet", "video", null, 1], ["pets", "dogs", null, 1],
]);

// Going deeper: the second set, reached from the tabs
await A.getByRole("link", { name: "Going deeper" }).filter({ visible: true }).first().click();
await A.waitForURL("**/dating/questions?pack=deep");
await assert(await seen(A.getByText("Question 1 of 16")) && await seen(A.getByRole("heading", { name: "What counts as cheating to you?" })), "the deep set opens on its own first question");
await A.getByRole("radio", { name: "A secret emotional bond counts too" }).check();
await A.getByRole("checkbox", { name: "A secret emotional bond counts too" }).check({ force: true });
await A.getByRole("radio", { name: "Very" }).check({ force: true });
await A.evaluate(() => window.scrollTo(0, 0)); await shot(A, "01b-deep-question"); await axe(A, "deep-questions");
await A.getByRole("button", { name: "Next" }).click();
await assert(await seen(A.getByRole("heading", { name: "What makes you feel most loved?" })), "deep answer saved, on to love languages");
await answerAll(A, [["phone", "ask", null, 2], ["sharemoney", "bills", null, 2]]);

const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 7302");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk on the promenade" });
await answerAll(S, [
  ["looking", "long", ["long", "unsure"], 3], ["kids", "want", null, 2], ["smoke", "never", null, 2], ["drink", "social", null, 1],
  ["weekend", "active", null, 2], ["texting", "few", null, 1], ["planning", "both", null, 1], ["pets", "dogs", null, 2],
  ["cheating", "emotional", null, 3], ["phone", "ask", null, 2], ["sharemoney", "bills", null, 1],
]);

const K = await newPhone();
await signIn(K, "Kyle Naidoo", "084 555 7303");
await profile(K, { photo: "p-kyle.jpg", dob: "1996-11-30", gender: "Man", seeking: "Women", idea: "Learn to surf at North Beach" });
await answerAll(K, [
  ["looking", "casual", ["casual"], 3], ["kids", "dont", ["dont"], 3], ["smoke", "often", null, 0], ["drink", "often", null, 1],
  ["weekend", "out", null, 1], ["texting", "allday", null, 2], ["planning", "spont", null, 1], ["pets", "none", null, 1],
]);

// Ayesha's Discover: Sipho first with a high %, Kyle after with a low one
await A.goto(`${BASE}/discover`);
await assert(await seen(A.getByRole("article", { name: /Sipho/ })), "the most compatible person (Sipho) is shown first");
const sScore = Number(await A.locator("[data-match-score]").filter({ visible: true }).first().getAttribute("data-match-score"));
await assert(sScore >= 80, `Sipho shows a high match % (${sScore}%)`);
await assert(await seen(A.getByText(/You both/)), "the card says what they have in common");
await assert(!(await A.getByText(/See your match %/).count()), "the answer prompt is gone once enough questions are answered");
await shot(A, "02-discover-high"); await axe(A, "discover");
await A.getByRole("button", { name: /^Like Sipho/ }).click();
await assert(await seen(A.getByRole("article", { name: /Kyle/ })), "Kyle comes next");
const kScore = Number(await A.locator("[data-match-score]").filter({ visible: true }).first().getAttribute("data-match-score"));
await assert(kScore < 30, `Kyle shows a low match % (${kScore}%) because of things Ayesha marked as important`);
await shot(A, "03-discover-low");

// Answers stay private
const theirAnswers = await K.evaluate(async () => (await (await fetch("/api/dating/answers")).json()));
await assert(theirAnswers.looking?.a === "casual" && Object.keys(theirAnswers).length === 8, "the answers API returns only your own answers");
const cardJson = await K.evaluate(async () => JSON.stringify(await (await fetch("/api/dating/discover")).json()));
await assert(cardJson.includes('"score"') && !cardJson.includes('"answers"') && !cardJson.includes('"imp"'), "Discover sends scores and shared points, never raw answers");

// Sipho likes back: the match info shows the breakdown
await S.goto(`${BASE}/discover`);
await S.getByRole("button", { name: /^Like Ayesha/ }).click();
await S.getByRole("dialog", { name: "It's a match" }).waitFor();
await S.getByRole("button", { name: /Send Ayesha a message/ }).click();
await S.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
await S.goto(`${S.url()}/info`);
await assert(await seen(S.getByText(/% match/)) && await seen(S.getByText(/Based on \d+ questions you both answered/)), "match info shows the % and what it's based on");
await assert(await seen(S.getByText(/secret emotional bonds count as cheating/)), "deep answers they share show up on the match info");
await shot(S, "04-match-info"); await axe(S, "match-info");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL COMPATIBILITY CHECKS PASSED");
await browser.close();
