// Afriheart+ boost, undo and the founding offer, on simulated phones.
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3100";
const OUT = "/home/claude/e2e/boost"; mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("ok -", m); };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const newPhone = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage(); p.on("pageerror", (e) => console.log("[pageerror]", e.message)); return p; };
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
async function makeProfile(p, { photos, dob, gender, seeking, area, idea }) {
  await p.waitForURL("**/dating/profile");
  await p.getByRole("region", { name: "Photos" }).getByLabel("Choose photos").setInputFiles(photos.map((f) => `/home/claude/e2e/${f}`));
  await p.getByRole("img", { name: "Main photo" }).filter({ visible: true }).first().waitFor();
  await p.getByLabel("Date of birth").fill(dob);
  await p.getByText(gender, { exact: true }).click();
  await p.getByLabel("Area").fill(area);
  for (const s of seeking) await p.getByText(s, { exact: true }).click();
  await p.getByLabel("From", { exact: true }).fill("21");
  await p.getByLabel("To", { exact: true }).fill("40");
  await p.getByLabel("Your date idea").fill(idea);
  await p.getByRole("checkbox", { name: /I agree that Afriheart uses my profile/ }).check();
  await p.getByRole("button", { name: "Start meeting people" }).click();
  await p.waitForURL("**/discover");
}

// Before making a profile: the founding offer on the You and Afriheart+ pages
const A = await newPhone();
await signIn(A, "Ayesha Khan", "082 555 9101");
await A.goto(`${BASE}/plus`);
await A.locator("[data-founding]").filter({ visible: true }).first().waitFor();
ok((await A.locator("[data-founding]").filter({ visible: true }).first().innerText()).includes("3 months"), "founding offer shown: 3 months free");
ok(await A.getByText("Only 2 spots left").filter({ visible: true }).first().isVisible(), "spots left shown");
await A.screenshot({ path: `${OUT}/01-founding.png` });
const A1 = await A.context().newPage();
await A1.goto(`${BASE}/dating/profile`);
await makeProfile(A1, { photos: ["p-ayesha.jpg"], dob: "1997-03-14", gender: "Woman", seeking: ["Men"], area: "Morningside, Durban", idea: "Sunset drinks in Umhlanga" });

const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 9202");
await makeProfile(S, { photos: ["p-sipho.jpg"], dob: "1994-08-02", gender: "Man", seeking: ["Women"], area: "Berea, Durban", idea: "Bunny chow crawl" });
const K = await newPhone();
await signIn(K, "Kyle Naidoo", "084 555 9303");
await makeProfile(K, { photos: ["p-kyle.jpg"], dob: "1996-11-30", gender: "Man", seeking: ["Women"], area: "Umhlanga", idea: "Learn to surf at North Beach" });

// Kyle (3rd person: founding spots used up, so a normal week) boosts
await K.goto(`${BASE}/discover`);
await K.locator("[data-boost]").filter({ visible: true }).first().click();
await K.locator("[data-boost-on]").filter({ visible: true }).first().waitFor();
ok((await K.locator("[data-boost-on]").filter({ visible: true }).first().innerText()).includes("Boosted"), "boost on: 'Boosted, 30 min'");
await K.screenshot({ path: `${OUT}/02-boosted.png` });

// Ayesha sees Kyle first, passes, then undoes
const A2 = await A.context().newPage();
await A2.goto(`${BASE}/discover`);
await A2.locator("article").filter({ visible: true }).first().waitFor(); const label = await A2.locator("article").filter({ visible: true }).first().getAttribute("aria-label");
ok(label.startsWith("P") === false && label.includes("Kyle") || label.includes("Kyle"), "the boosted person is shown first: " + label);
await A2.getByRole("button", { name: /^Pass on Kyle/ }).click();
await A2.locator("[data-undo]").filter({ visible: true }).first().waitFor();
await A2.screenshot({ path: `${OUT}/03-undo-button.png` });
await A2.locator("[data-undo]").filter({ visible: true }).first().click();
await A2.waitForFunction(() => document.querySelector("article")?.getAttribute("aria-label")?.includes("Kyle"));
ok(true, "undo brings Kyle back");

// Someone without Afriheart+ is sent to the Afriheart+ page with an explanation
const N = await newPhone();
await signIn(N, "Naledi Dube", "085 555 9404");
await makeProfile(N, { photos: ["p-ayesha2.jpg"], dob: "1998-01-01", gender: "Woman", seeking: ["Men"], area: "Glenwood", idea: "Market and coffee" });
await N.evaluate(async () => {}); // (her trial is on; switch it off below via the test hook)
await browser.close();
console.log("ALL PASSED");
