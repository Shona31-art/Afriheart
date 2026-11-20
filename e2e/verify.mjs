// Distance matching, selfie verification and the team queue, end to end on simulated phones.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/verify", import.meta.url).pathname;
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
const visibleCount = (p, re) => p.getByRole("article", { name: re }).filter({ visible: true }).count();

// Ayesha in Durban picks her city, 25 km max
const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 6201");
await A.getByText("Where you are").waitFor();
await shot(A, "00-profile-location-empty");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks in Umhlanga", city: "Durban" });
await A.goto(`${BASE}/dating/profile`);
await assert(await seen(A.getByText("Your approximate location is saved")), "her location is saved, without showing coordinates");
await A.getByText("25 km", { exact: true }).filter({ visible: true }).click();
await A.getByRole("button", { name: "Save profile" }).filter({ visible: true }).click();
await A.waitForURL("**/discover");

// Sipho shares his phone's location in Umhlanga (about 15 km away)
const S = await newPhone({ permissions: ["camera", "geolocation"], geolocation: { latitude: -29.7262, longitude: 31.0849 } });
await signIn(S, "Sipho Mthembu", "083 555 6202");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk on the promenade", gps: true });
const raw = await S.evaluate(async () => (await (await fetch("/api/dating/profile")).json()));
await assert(raw.lat === -29.73 && raw.lng === 31.08, `the phone's location is rounded to about 1 km before saving (${raw.lat}, ${raw.lng})`);

// Kyle in Cape Town, Lebo in Durban
const K = await newPhone();
await signIn(K, "Kyle Naidoo", "084 555 6203");
await profile(K, { photo: "p-kyle.jpg", dob: "1996-11-30", gender: "Man", seeking: "Women", idea: "Learn to surf at Muizenberg", city: "Cape Town" });
const L = await newPhone();
await signIn(L, "Lebo Dlamini", "085 555 6204");
await profile(L, { photo: "p-kyle.jpg", dob: "1995-05-20", gender: "Man", seeking: "Women", idea: "Bunny chow crawl", city: "Durban" });

// Ayesha's Discover: Sipho and Lebo nearby, Kyle too far
await A.goto(`${BASE}/discover`);
await assert(await seen(A.getByRole("article", { name: /Sipho|Lebo/ })), "nearby people show up");
const cards = await A.evaluate(async () => (await (await fetch("/api/dating/discover")).json()));
const names = cards.map((c) => c.name).sort();
await assert(names.join() === "Lebo,Sipho", `people outside her 25 km don't show (Kyle in Cape Town is hidden): ${names}`);
const sCard = cards.find((c) => c.name === "Sipho");
await assert(sCard.distance === "Less than 25 km away" && !JSON.stringify(cards).match(/"lat"|"lng"/), `other people see a rough distance only ("${sCard.distance}"), never coordinates`);
const kCards = await K.evaluate(async () => (await (await fetch("/api/dating/discover")).json()));
await assert(!kCards.some((c) => c.name === "Ayesha"), "and it works both ways: Kyle doesn't see Ayesha");

// Sipho verifies with a live selfie
await S.goto(`${BASE}/you`);
await S.getByRole("link", { name: "Get verified" }).click();
await S.waitForURL("**/dating/verify");
await shot(S, "01-verify-intro"); await axe(S, "verify-intro");
await assert(await S.getByRole("button", { name: "Start" }).isDisabled(), "verification needs consent first");
await S.getByRole("checkbox", { name: /uses this selfie only to check it's me/ }).check();
await S.getByRole("button", { name: "Start" }).click();
const pose = await S.locator("[data-gesture]").getAttribute("data-gesture", { timeout: 15000 });
await assert(!!pose, `the server gives a pose to do: "${pose}"`);
await S.waitForFunction(() => document.querySelector("video")?.videoWidth > 0, null, { timeout: 15000 });
await shot(S, "02-verify-camera"); await axe(S, "verify-camera");
await S.getByRole("button", { name: "Take selfie" }).click();
await assert(await seen(S.getByRole("img", { name: "Your selfie" })), "the selfie is taken from the live camera");
await S.getByRole("button", { name: "Send for checking" }).click();
await assert(await seen(S.getByText("Your selfie is being checked")), "it waits for the team");
await shot(S, "03-verify-pending");
const noGallery = await S.evaluate(() => document.querySelectorAll('input[type="file"]').length);
await assert(noGallery === 0, "there's no way to upload an old photo instead");

// The team
const T = await newPhone();
await signIn(T, "Thandi (Afriheart team)", "082 555 9999");
await A.goto(`${BASE}/team`);
await assert(await seen(A.getByRole("heading", { name: "This page isn't here" })), "people who aren't on the team can't open the team page");
await T.goto(`${BASE}/team`);
await assert(await seen(T.getByRole("article", { name: "Selfie from Sipho" })), "the team sees Sipho's selfie next to his photos");
await assert(await seen(T.getByText(pose)), "with the pose he was asked for");
const selfieSrc = await T.getByRole("img", { name: "Selfie from Sipho" }).getAttribute("src");
await T.getByRole("img", { name: "Selfie from Sipho" }).evaluate((img) => img.decode());
await shot(T, "04-team-selfie"); await axe(T, "team-selfies");
const before = await A.evaluate(async (u) => (await fetch(u)).status, selfieSrc);
await assert(before === 404, "nobody outside the team can load a selfie");
await T.getByRole("button", { name: "Approve" }).click();
await assert(await seen(T.getByText("No selfies waiting. Nice.")), "approved");
const after = await T.evaluate(async (u) => (await fetch(u)).status, selfieSrc);
await assert(after === 404, "the selfie is deleted once it's checked, even for the team");

// Ayesha reports Lebo (the report screen itself is covered by dating.mjs); the team removes him
const leboId = cards.find((c) => c.name === "Lebo").id;
const rep = await A.evaluate(async (id) => (await fetch("/api/dating/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ person_id: id, reason: "harassment", details: "Kept messaging after I said no." }) })).status, leboId);
await assert(rep === 200, "Ayesha reports Lebo");
await T.goto(`${BASE}/team`);
await T.getByRole("tab", { name: /Reports/ }).click();
await assert(await seen(T.getByRole("article", { name: "Report about Lebo" })), "the report reaches the team");
await shot(T, "06-team-report"); await axe(T, "team-reports");
T.once("dialog", (d) => d.accept());
await T.getByRole("button", { name: "Remove from dating" }).click();
await assert(await seen(T.getByText("No open reports.")), "the team can remove someone from dating");
const leboDiscover = await L.evaluate(async () => (await (await fetch("/api/dating/discover")).json()));
await assert(/removed after a safety review/.test(leboDiscover.error ?? JSON.stringify(leboDiscover)), "Lebo is told his profile was removed");

// The badge
await S.goto(`${BASE}/dating/verify`);
await assert(await seen(S.getByText("You're verified")), "Sipho is verified");
const again = await A.evaluate(async () => (await (await fetch("/api/dating/discover")).json()));
await assert(again.find((c) => c.name === "Sipho")?.verified === true && cards.find((c) => c.name === "Lebo")?.verified === false, "Discover cards say who's verified");
await assert(!again.some((c) => c.name === "Lebo"), "the removed person no longer shows up");
await A.goto(`${BASE}/discover`);
await assert(await seen(A.getByText("photo verified", { exact: false })), "the card shows the verified badge");
await shot(A, "05-discover-badge"); await axe(A, "discover");

// Verified people only
const ayeshaNow = await A.evaluate(async () => (await (await fetch("/api/dating/profile")).json()));
await assert(ayeshaNow.verified_only !== true, "verified-only stays off until you're verified");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL DISTANCE AND VERIFICATION CHECKS PASSED");
await browser.close();
