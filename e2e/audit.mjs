// Security probes against a running server. Each probe prints FOUND (a problem) or ok.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/audit", import.meta.url).pathname;
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
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"] };
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

const found = [];
const probe = (bad, msg) => { console.log(bad ? "FOUND:" : "ok:", msg); if (bad) found.push(msg); };
const j = (p, url, method = "GET", data) => p.evaluate(async ([url, method, data]) => {
  const r = await fetch(url, { method, headers: data ? { "content-type": "application/json" } : {}, body: data ? JSON.stringify(data) : undefined });
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}, [url, method, data]);

const A = await newPhone(); await signIn(A, "Ayesha Khan", "082 555 7701");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks", city: "Durban" });
const S = await newPhone(); await signIn(S, "Sipho Mthembu", "083 555 7702");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk", city: "Durban" });
const C = await newPhone(); await signIn(C, "Craig Outsider", "084 555 7703");
await profile(C, { photo: "p-kyle.jpg", dob: "1990-01-01", gender: "Man", seeking: "Men", idea: "Gym session", city: "Cape Town" });

// Match A and S, open the chat
const sid = (await j(A, "/api/dating/discover")).body.find((c) => c.name === "Sipho").id;
const aid = (await j(S, "/api/dating/discover")).body.find((c) => c.name === "Ayesha").id;
await j(A, "/api/dating/swipe", "POST", { to: sid, action: "like" });
const m = await j(S, "/api/dating/swipe", "POST", { to: aid, action: "like" });
const chatId = m.body?.match?.chat_id;
console.log("chat", chatId);

// P1: outsider access to the chat
probe((await j(C, `/api/chats/${chatId}/messages`)).status === 200, "outsider can read the chat messages");
probe((await j(C, `/api/chats/${chatId}`)).status === 200, "outsider can read the chat");
probe((await j(C, `/api/chats/${chatId}/az`)).status === 200, "outsider can read the alphabet album");
probe((await j(C, `/api/chats/${chatId}/devices`)).status === 200, "outsider can list the chat's devices");
const up = await A.evaluate(async (id) => { const f = new FormData(); f.set("file", new File([new Uint8Array(5000).fill(3)], "m.bin", { type: "application/octet-stream" })); const r = await fetch(`/api/chats/${id}/media`, { method: "POST", body: f }); return r.json(); }, chatId);
probe((await C.evaluate(async (u) => (await fetch(u)).status, `/api/media/${up.path}`)) === 200, "outsider can download the chat's (encrypted) media");
probe((await S.evaluate(async (u) => (await fetch(u)).status, `/api/media/${up.path}`)) !== 200, "chat member can't download chat media (should work)");
// P2: photos of someone outside your preferences
const aPhoto = (await j(S, "/api/dating/discover")).body; // Sipho matched, so check via profile
const aProf = await j(A, "/api/dating/profile");
probe((await C.evaluate(async (u) => (await fetch(u)).status, `/api/dating/photos/${aProf.body.photos[0]}`)) === 200, "someone who can't see Ayesha in Discover can load her photo");

// P3: verified badge survives swapping photos
// (simulate: team-free check via code path) — profile save keeps verified_at regardless of photos
// P4: open redirect after sign-in
const D = await newPhone();
await D.goto(`${BASE}/signin?next=${encodeURIComponent("/\\example.org")}`);
await D.getByLabel("Your name").fill("Redirect Test");
await D.getByLabel("Mobile number").fill("086 555 7704");
await D.getByRole("button", { name: "Send me a code" }).click();
await D.waitForURL((u) => u.searchParams.get("step") === "code");
await D.getByLabel("Code").fill(await D.locator("[data-test-code]").getAttribute("data-test-code"));
const nav = D.waitForRequest((r) => r.url().includes("example.org"), { timeout: 8000 }).then(() => true, () => false);
await D.getByRole("button", { name: "Verify" }).click();
probe(await nav, "open redirect: /signin?next=/\\example.org sends you to example.org after signing in");

// P5: session survives sign-out (stolen cookie keeps working)
const ck = (await S.context().cookies()).find((c) => c.name === "common_session");
const E = await browser.newContext(); await E.addCookies([ck]);
const ep = await E.newPage(); await ep.goto(`${BASE}/signin`);
// "Sign out everywhere else" from Ayesha's phone ends her other sessions
const ack = (await A.context().cookies()).find((c) => c.name === "common_session");
const F = await browser.newContext(); await F.addCookies([ack]);
const fp = await F.newPage(); await fp.goto(`${BASE}/signin`);
await A.goto(`${BASE}/you`);
await A.getByRole("button", { name: "Sign out everywhere else" }).filter({ visible: true }).first().click();
await A.getByText("Signed out everywhere else.").waitFor();
probe((await j(A, "/api/dating/profile")).status !== 200, "sign out everywhere else also signed out this phone (it shouldn't)");
await S.goto(`${BASE}/you`);
S.once("dialog", (d) => d.accept());
await S.getByRole("button", { name: "Sign out", exact: true }).filter({ visible: true }).first().click();
await S.waitForURL((u) => !u.pathname.startsWith("/you"), { timeout: 15000 });
probe((await j(ep, "/api/dating/profile")).status === 200, "a copied session cookie still works after the person signs out (sessions can't be revoked)");

// P5b: a removed device's session stops working is covered in unit tests
// P6: no rate limits on likes, reports or messages
const t0 = Date.now(); let okCount = 0;
for (let i = 0; i < 150; i++) { const r = await j(C, "/api/dating/answers", "POST", { question: "smoke", a: "never", ok: [], imp: 2 }); if (r.status === 200) okCount++; }
probe(okCount === 150, `150 writes in ${Date.now() - t0} ms: ${okCount} accepted (no rate limiting if all were)`);
const cross = await C.evaluate(async () => (await fetch("/api/dating/answers", { method: "POST", headers: { "content-type": "application/json", "x-test": "1" }, body: "{}" })).status);
const evil = await fetch(`${BASE}/api/dating/answers`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json", cookie: `common_session=${(await C.context().cookies()).find((c) => c.name === "common_session").value}` }, body: "{}" });
probe(evil.status !== 403, `a request from another website is ${evil.status === 403 ? "refused" : "accepted"}`);

// P7: oversized JSON body
const big = await C.evaluate(async () => (await fetch("/api/dating/answers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "smoke", a: "never", pad: "x".repeat(20_000_000) }) })).status);
probe(big === 200, `a 20 MB JSON body got ${big} (should be refused)`);

// P8: removed / blocked person can still message a match — check blocked
// P9: headers
const h = await A.evaluate(async () => { const r = await fetch("/"); return Object.fromEntries(r.headers.entries()); });
probe(!h["content-security-policy"], "no Content-Security-Policy header");
probe(!h["x-frame-options"] && !(h["content-security-policy"] || "").includes("frame-ancestors"), "pages can be framed by any site (clickjacking)");
probe(!h["x-content-type-options"], "no X-Content-Type-Options: nosniff");
probe(!h["strict-transport-security"], "no Strict-Transport-Security (HSTS) header");
probe(!!h["x-powered-by"], "x-powered-by header reveals the framework");

console.log("\n" + found.length + " problems found");
await browser.close();
