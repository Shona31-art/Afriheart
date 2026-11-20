// Realtime chat: how fast messages, ticks and calls arrive, how many requests an idle phone makes, and the fallback when the live connection is blocked.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/realtime", import.meta.url).pathname;
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

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
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

const post = (p, url, data) => p.evaluate(async ([u, d]) => (await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(d) })).json(), [url, data]);
const get = (p, url) => p.evaluate(async (u) => (await fetch(u)).json(), url);

const anon = await (await fetch(`${BASE}/api/events`)).status;
await assert(anon === 401, "the live connection needs sign-in");

const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 9301");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks", city: "Durban" });
const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 9302");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk", city: "Durban" });
const sid = (await get(A, "/api/dating/discover")).find((c) => c.name === "Sipho").id;
const aid = (await get(S, "/api/dating/discover")).find((c) => c.name === "Ayesha").id;
await post(A, "/api/dating/swipe", { to: sid, action: "like" });
const chatId = (await post(S, "/api/dating/swipe", { to: aid, action: "like" })).match.chat_id;
await A.goto(`${BASE}/chats/${chatId}`);
await S.goto(`${BASE}/chats/${chatId}`);
const box = (p) => p.getByLabel("Message", { exact: true }).filter({ visible: true }).first();
await box(A).waitFor(); await box(S).waitFor();
await A.waitForTimeout(2500); // let the live connections open and keys settle

// 1. Message latency
const times = [];
for (let i = 1; i <= 5; i++) {
  const text = `Realtime test ${i} ${Date.now()}`;
  await box(S).fill(text);
  const t0 = Date.now();
  await S.getByRole("button", { name: "Send", exact: true }).filter({ visible: true }).first().click();
  await A.getByText(text).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  times.push(Date.now() - t0);
  await A.waitForTimeout(300);
}
times.sort((a, b) => a - b);
const median = times[2];
log(`message arrival times (ms): ${times.join(", ")}`);
await assert(median < 1500, `messages arrive in about ${median} ms (the backup poll alone would take up to 30 s)`);

// 2. Read ticks come back to the sender quickly
await box(A).fill("Read me");
await A.getByRole("button", { name: "Send", exact: true }).filter({ visible: true }).first().click();
await S.getByText("Read me").filter({ visible: true }).first().waitFor({ timeout: 10000 });
const t1 = Date.now();
await A.locator('.tick-read[aria-label="read"]').last().waitFor({ timeout: 15000 });
const readMs = Date.now() - t1;
await assert(readMs < 3000, `the "read" tick shows on the sender's phone in about ${readMs} ms`);

// 3. An idle open chat barely touches the server
let threadGets = 0;
const count = (r) => { if (r.method() === "GET" && new URL(r.url()).pathname === `/api/chats/${chatId}`) threadGets++; };
A.on("request", count);
await A.waitForTimeout(20000);
A.off("request", count);
await assert(threadGets <= 2, `an idle open chat made ${threadGets} requests in 20 s (it used to make about 13)`);

// 4. A call rings straight away
await A.goto(`${BASE}/`);
await A.waitForTimeout(1500);
const t2 = Date.now();
await S.getByRole("button", { name: "Voice call" }).filter({ visible: true }).first().click();
await A.getByRole("alertdialog", { name: /Incoming voice call/ }).waitFor({ timeout: 15000 });
const ringMs = Date.now() - t2;
await assert(ringMs < 3000, `an incoming call rings in about ${ringMs} ms`);
await shot(A, "01-ringing");
await A.getByRole("button", { name: /Decline/ }).first().click().catch(() => {});
await S.waitForTimeout(1000);
await S.goto(`${BASE}/chats/${chatId}`);

// 5. Live connection blocked (e.g. a strict network): quick polling takes over
const B = await (await browser.newContext({ ...phone })).newPage();
await B.context().addCookies(await A.context().cookies());
await B.route("**/api/events", (r) => r.abort());
await B.goto(`${BASE}/chats/${chatId}`);
await box(B).waitFor();
await B.waitForTimeout(1500);
const fallbackText = `Fallback ${Date.now()}`;
await box(S).fill(fallbackText);
const t3 = Date.now();
await S.getByRole("button", { name: "Send", exact: true }).filter({ visible: true }).first().click();
await B.getByText(fallbackText).filter({ visible: true }).first().waitFor({ timeout: 15000 });
const fallbackMs = Date.now() - t3;
await assert(fallbackMs < 5000, `with the live connection blocked, the message still arrives by polling in about ${fallbackMs} ms`);

console.log("\nALL REALTIME CHECKS PASSED");
await browser.close();
