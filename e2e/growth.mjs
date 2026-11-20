// Growth features end to end: the public alphabet page, the no-sign-up quiz, and sharing album pages and results as Story images.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/growth", import.meta.url).pathname;
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
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"], acceptDownloads: true };
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

// 1. A visitor from TikTok, not signed in, lands on the alphabet page
const V = await newPhone();
await V.goto(`${BASE}/alphabet-dates`);
await assert(await seen(V.getByRole("heading", { name: "Alphabet date ideas", level: 1 })), "the public alphabet page works without signing in");
await assert((await V.getByRole("heading", { level: 3 }).count()) === 26, "it lists all 26 letters");
await assert(await seen(V.getByText(/Afternoon tea, All-you-can-eat sushi/)), "with ideas in every style");
await assert(!(await V.getByRole("navigation", { name: "Main" }).count()), "no app tab bar for visitors");
await assert(await seen(V.getByRole("link", { name: "Start your album on Afriheart" })) && await seen(V.getByRole("link", { name: "Take the compatibility quiz" }).first()), "with a way in");
await shot(V, "01-alphabet-page"); await axe(V, "alphabet-page");

// 2. Ayesha makes a quiz, no account
async function takeQuiz(p, impFor) {
  for (let i = 0; i < 10; i++) {
    await p.getByText(/^Question \d+ of 10$/).filter({ visible: true }).first().waitFor();
    await p.getByRole("radio").filter({ visible: true }).first().check();
    const imp = impFor(i);
    if (imp) await p.locator(`label:has(input[name^="imp-"])`).filter({ hasText: imp }).filter({ visible: true }).first().click();
    if (i === 0) { await shot(p, "02-quiz-question"); await axe(p, "quiz-question"); }
    await p.getByRole("button", { name: i === 9 ? "See results" : "Next" }).click();
  }
}
await V.getByRole("link", { name: "Take the compatibility quiz" }).first().click();
await V.waitForURL("**/quiz");
await assert(await seen(V.getByRole("heading", { name: "How compatible are you?" })), "the quiz opens");
await V.getByLabel("Your first name").fill("Ayesha");
await V.getByRole("button", { name: "Start" }).click();
await takeQuiz(V, (i) => (i < 3 ? "Must match" : null));
await assert(await seen(V.getByRole("heading", { name: "Now send it" })), "after ten questions she gets a link to send");
const link = await V.locator("[data-quiz-link]").getAttribute("data-quiz-link");
const wa = await V.getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href");
await assert(link.includes("/quiz/") && wa.startsWith("https://wa.me/?text=") && decodeURIComponent(wa).includes(link), "with a WhatsApp button");
await shot(V, "03-quiz-send"); await axe(V, "quiz-send");
const slug = link.split("/quiz/")[1];
const info = await (await fetch(`${BASE}/api/quiz/${slug}`)).json();
await assert(info.name === "Ayesha" && !JSON.stringify(info).includes("answers"), "anyone with the link sees whose quiz it is, never her answers");

// 3. Sipho opens the link on his phone, no account
const W = await newPhone();
await W.goto(link);
await assert(await seen(W.getByRole("heading", { name: "How compatible are you and Ayesha?" })), "the link says whose quiz it is");
await shot(W, "04-quiz-invite");
await W.getByLabel("Your first name").fill("Sipho");
await W.getByRole("button", { name: "Start" }).click();
await takeQuiz(W, () => null);
await assert(await seen(W.getByRole("heading", { name: "Your result" })), "Sipho sees the result straight away");
const score = Number(await W.locator("[data-quiz-score]").getAttribute("data-quiz-score"));
await assert(score === 100, `same answers: ${score}%`);
await assert(await seen(W.getByText(/You both/)), "with what they have in common");
await W.evaluate(() => document.fonts.ready);
await shot(W, "05-quiz-result"); await axe(W, "quiz-result");
const [dl] = await Promise.all([W.waitForEvent("download", { timeout: 20000 }), W.getByRole("button", { name: "Share to Stories or TikTok" }).click()]);
await dl.saveAs(`${OUT}/quiz-story.jpg`);
await assert(await seen(W.getByText("Saved. Post it from your photos.")), "the result saves as a Story image where sharing files isn't possible");
await W.reload();
await assert(await seen(W.getByRole("heading", { name: "Your result" })), "coming back shows his result again");

// 4. Ayesha sees Sipho's answer arrive
await V.goto(link);
await assert(await seen(V.getByRole("heading", { name: "Your quiz" })) && await seen(V.getByRole("article", { name: "Result with Sipho" })), "Ayesha sees Sipho's result on her quiz page");
await shot(V, "06-quiz-owner");
// A third person only gets the invite
const X = await newPhone();
await X.goto(link);
await assert(await seen(X.getByRole("heading", { name: "How compatible are you and Ayesha?" })), "someone else with the link only gets the invite, not anyone's results");
const peek = await fetch(`${BASE}/api/quiz/${slug}/results`);
await assert(peek.status === 403, "results need the maker's private key");

// 5. A matched couple shares an album page
const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 8801");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks", city: "Durban" });
const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 8802");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk", city: "Durban" });
const sid = (await A.evaluate(async () => (await (await fetch("/api/dating/discover")).json()))).find((c) => c.name === "Sipho").id;
const aid = (await S.evaluate(async () => (await (await fetch("/api/dating/discover")).json()))).find((c) => c.name === "Ayesha").id;
const post = (p, url, data) => p.evaluate(async ([u, d]) => (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) })).json(), [url, data]);
await post(A, "/api/dating/swipe", { to: sid, action: "like" });
const chatId = (await post(S, "/api/dating/swipe", { to: aid, action: "like" })).match.chat_id;
await A.goto(`${BASE}/chats/${chatId}/az`);
await A.getByRole("button", { name: "Fill in A" }).click();
await A.getByRole("dialog").getByLabel("Photo for A").setInputFiles(new URL("./az-aquarium.jpg", import.meta.url).pathname);
await seen(A.locator('article[data-az="A"]').getByRole("img", { name: "Your Aquarium date" }), 20000);
await A.getByRole("dialog").getByLabel("Our story").fill("Sipho named every single fish. The jellyfish tunnel was the best part.");
await A.getByRole("dialog").locator('label:has(input[aria-label="5 hearts"])').click();
await A.getByRole("dialog").getByRole("button", { name: "Save page", exact: true }).click();
await A.getByRole("dialog").getByRole("button", { name: "Share to Stories or TikTok" }).click();
await assert(await seen(A.getByRole("img", { name: "Story image of A is for Aquarium" }), 20000), "a Story-sized preview of the page");
await A.getByRole("region", { name: "Share this page" }).scrollIntoViewIfNeeded();
await shot(A, "07-album-share"); await axe(A, "album-share");
const [st] = await Promise.all([A.waitForEvent("download", { timeout: 20000 }), A.getByRole("region", { name: "Share this page" }).getByRole("button", { name: "Share", exact: true }).click()]);
await st.saveAs(`${OUT}/album-story.jpg`);
await A.getByRole("checkbox", { name: "Include our story" }).uncheck();
const [st2] = await Promise.all([A.waitForEvent("download", { timeout: 20000 }), A.getByRole("region", { name: "Share this page" }).getByRole("button", { name: "Share", exact: true }).click()]);
await st2.saveAs(`${OUT}/album-story-private.jpg`);
log("ok: shared the page with and without the story");

// 6. Rate limit on making quizzes
let limited = false;
for (let i = 0; i < 25 && !limited; i++) {
  const r = await fetch(`${BASE}/api/quiz`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Spam", answers: {} }) });
  if (r.status === 429) limited = true;
}
await assert(limited, "making lots of quizzes from one network gets rate-limited");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL GROWTH CHECKS PASSED");
await browser.close();
