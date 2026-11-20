// Alphabet date ideas end to end: a matched couple fills in the album with encrypted photos and stories, then exports it as a PDF.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = new URL("./shots/az", import.meta.url).pathname;
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
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true };
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

await signIn(A, "Ayesha Khan", "082 555 8401");
await profile(A, { photo: "p-ayesha.jpg", dob: "1997-03-14", gender: "Woman", seeking: "Men", idea: "Sunset drinks in Umhlanga" });
const S = await newPhone();
await signIn(S, "Sipho Mthembu", "083 555 8402");
await profile(S, { photo: "p-sipho.jpg", dob: "1994-08-02", gender: "Man", seeking: "Women", idea: "Sunrise walk on the promenade" });
await S.getByRole("button", { name: /^Like Ayesha/ }).click();
await A.goto(`${BASE}/discover`);
await A.getByRole("button", { name: /^Like Sipho/ }).click();
await A.getByRole("dialog", { name: "It's a match" }).waitFor();
await A.getByRole("button", { name: /Send Sipho a message/ }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();

// Open the album from the chat header
await A.getByRole("link", { name: "Alphabet date ideas" }).filter({ visible: true }).first().click();
await A.waitForURL("**/az");
await assert(await seen(A.getByRole("heading", { name: "Alphabet date ideas" })), "the album opens from the chat header");
await assert((await A.locator("article[data-az]").filter({ visible: true }).count()) === 26, "26 album pages");
await assert(await seen(A.getByRole("heading", { name: "A is for Aquarium" })) && await seen(A.getByRole("heading", { name: "Z is for Zoo" })), "A is for Aquarium ... Z is for Zoo");
await assert(await seen(A.getByText("0 of 26 dates so far")), "the cover starts at 0 of 26");
await shot(A, "01-album-cover"); await axe(A, "album");

const sheet = () => A.getByRole("dialog");
// Pick another idea for B
await A.getByRole("button", { name: "Fill in B" }).click();
await assert(await seen(sheet().getByRole("heading", { name: /B\s*is for Bowling/ })), "tapping a page opens it");
await axe(A, "sheet");
await sheet().getByText("Braai at the beach", { exact: true }).click();
await sheet().getByRole("button", { name: "Save page", exact: true }).click();
await assert(await seen(A.getByRole("heading", { name: "B is for Braai at the beach" })), "pick one of the ideas for a letter");
await A.keyboard.press("Escape");
await assert(!(await A.getByRole("dialog").count()), "Escape closes the sheet");

// Plan C in the chat
await A.getByRole("button", { name: "Fill in C" }).click();
await sheet().getByRole("button", { name: "Plan it in the chat" }).click();
await assert(await seen(sheet().getByRole("link", { name: "Open the plan" })), "planning a letter makes a plan in the chat");
await A.keyboard.press("Escape");
await assert(await seen(A.getByRole("link", { name: "C, Cooking class, planned" })), "the contents show C as planned");

// Tick off A and H with photos; A gets a story and five hearts
async function tick(p, letter, name, file) {
  await p.getByRole("button", { name: `Fill in ${letter}` }).click();
  await p.getByRole("dialog").getByLabel(`Photo for ${letter}`).setInputFiles(new URL(`./${file}`, import.meta.url).pathname);
  await assert(await seen(p.locator(`article[data-az="${letter}"]`).getByRole("img", { name: `Your ${name} date` }), 20000), `${letter} ticked off with a photo on its page`);
}
await tick(A, "A", "Aquarium", "az-aquarium.jpg");
await sheet().getByLabel("Our story").fill("Sipho named every single fish. The jellyfish tunnel was the best part, and we stayed for the feeding.");
await sheet().locator(`label:has(input[aria-label="5 hearts"])`).click();
await sheet().getByRole("button", { name: "Save page", exact: true }).click();
await assert(await seen(A.locator('article[data-az="A"]').getByText(/named every single fish/)), "the story shows on the page");
await assert(await seen(A.locator('article[data-az="A"]').getByRole("img", { name: "5 out of 5 hearts" })), "five hearts on the page");
await A.keyboard.press("Escape");
await tick(A, "H", "Hike", "az-hike.jpg");
await A.keyboard.press("Escape");
await assert(await seen(A.getByText("2 of 26 dates so far")), "the cover counts the dates done");

// Sipho sees the same album, decrypted on his phone, and adds a page
const chatId = new URL(chatUrl).pathname.split("/")[2];
await S.goto(`${BASE}/chats/${chatId}/az`);
await assert(await seen(S.getByRole("heading", { name: "B is for Braai at the beach" })), "the other person sees the same album");
await assert(await seen(S.locator('article[data-az="A"]').getByText(/named every single fish/), 20000), "Sipho's phone decrypts Ayesha's story");
const src = await S.locator('article[data-az="A"] img').first().getAttribute("src");
await assert(src?.startsWith("blob:"), "the photo is decrypted on the phone (blob URL, not a server image)");
await tick(S, "P", "Picnic", "beach.jpg");
await S.getByRole("dialog").getByLabel("Our story").fill("Packed way too much food. A dog stole a sandwich and we let him have it.");
await S.getByRole("dialog").locator(`label:has(input[aria-label="4 hearts"])`).click();
await S.getByRole("dialog").getByRole("button", { name: "Save page", exact: true }).click();
await assert(await seen(S.locator('article[data-az="P"]').getByText(/dog stole a sandwich/)), "both people add to the album");
await shot(S, "03-sheet");
await S.keyboard.press("Escape");
await S.locator('article[data-az="A"]').scrollIntoViewIfNeeded();
await shot(S, "02-page-done"); await axe(S, "album-pages");

// Date style and album look, shared by both people
await S.getByRole("button", { name: "Style and look" }).click();
const settings = S.getByRole("dialog", { name: "Style and look" });
await assert(await seen(settings), "the style and look sheet opens");
await axe(S, "settings");
await settings.getByText("Foodie", { exact: true }).click();
await assert(await seen(S.getByRole("heading", { name: "D is for Dinner somewhere new" })), "a new date style changes the letters you haven't touched (D: Dinner somewhere new)");
await assert(await seen(S.getByRole("heading", { name: "A is for Aquarium" })) && await seen(S.getByRole("heading", { name: "B is for Braai at the beach" })), "letters you've picked or done keep their date");
await shot(S, "05-settings");
await settings.getByText("Midnight & gold", { exact: true }).click();
await assert(await seen(S.locator("main.album[data-look=midnight]")), "the album look changes");
await S.keyboard.press("Escape");
await S.evaluate(() => window.scrollTo(0, 0));
await shot(S, "06-midnight-cover"); await axe(S, "album-midnight");

// Surprise us
await S.getByRole("button", { name: "Surprise us" }).first().click();
await assert(await seen(S.getByRole("dialog").getByText(/^Surprise! How about/)), "Surprise us picks a letter and an idea");
const before = await S.getByRole("dialog").getByLabel("Or write your own").inputValue();
await S.getByRole("dialog").getByRole("button", { name: "Surprise us" }).click();
const after = await S.getByRole("dialog").getByLabel("Or write your own").inputValue();
await assert(after && after !== before, `Surprise us inside a letter suggests another idea (${before} → ${after})`);
await S.keyboard.press("Escape");

// Save one page as an image
await S.getByRole("button", { name: "Edit A" }).click();
const [img] = await Promise.all([S.waitForEvent("download"), S.getByRole("dialog").getByRole("button", { name: "Save page as image" }).click()]);
await img.saveAs(`${OUT}/page-A.jpg`);
await assert(img.suggestedFilename() === "alphabet-date-A.jpg", "a page saves as an image");
await S.keyboard.press("Escape");

// Export the album as a PDF
await S.getByRole("button", { name: "Export album" }).click();
await assert(await seen(S.getByRole("dialog", { name: "Export your album" })), "export opens");
await axe(S, "export");
await shot(S, "04-export");
const [pdf] = await Promise.all([S.waitForEvent("download", { timeout: 60000 }), S.getByRole("dialog").getByRole("button", { name: "Save as PDF" }).click()]);
await pdf.saveAs(`${OUT}/album.pdf`);
const bytes = readFileSync(`${OUT}/album.pdf`);
const pageCount = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
await assert(bytes.subarray(0, 5).toString() === "%PDF-" && pageCount === 4, `the album exports as a PDF: cover plus the 3 dates done (${pageCount} pages)`);
await assert(await seen(S.getByText("Saved. Look in your downloads.")), "it says where the file went");
await S.keyboard.press("Escape");

// The photos and stories are ordinary encrypted chat messages
await A.goto(chatUrl);
await assert(await seen(A.getByText(/A is for Aquarium ✓/)) && await seen(A.getByText(/Our alphabet dates: A is for Aquarium/)), "the photo and story are in the chat too");
const raw = await A.evaluate(async (id) => JSON.stringify(await (await fetch(`/api/chats/${id}/az`)).json()), chatId);
await assert(!raw.includes("jellyfish tunnel") && !/"key"|"iv"/.test(raw), "the server only has sealed messages: no story text, no photo keys");

// Undo
await A.goto(`${BASE}/chats/${chatId}/az`);
await assert(await seen(A.locator("main.album[data-look=midnight]")) && await seen(A.getByText("Foodie", { exact: true })), "the other person sees the same style and look");
await A.getByRole("button", { name: "Edit H" }).click();
await sheet().getByRole("button", { name: "Not done yet" }).click();
await A.keyboard.press("Escape");
await assert(await seen(A.getByText("2 of 26 dates so far")), "a page can be marked not done");

// One page saved in every look
for (const look of ["cream", "floral", "midnight", "sunny"]) {
  await A.evaluate(async ([id, look]) => fetch(`/api/chats/${id}/az`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "album", look }) }), [chatId, look]);
  await A.reload();
  await A.getByRole("button", { name: "Edit A" }).click();
  const [d] = await Promise.all([A.waitForEvent("download"), A.getByRole("dialog").getByRole("button", { name: "Save page as image" }).click()]);
  await d.saveAs(`${OUT}/look-${look}.jpg`);
  await A.keyboard.press("Escape");
}
log("ok: saved page A in all four looks");

for (const [k, v] of Object.entries(axeIssues)) console.log("axe", k, v.length ? v.join(" ; ") : "clean");
console.log("\nALL ALPHABET DATE CHECKS PASSED");
await browser.close();
