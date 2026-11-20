// Dark mode and the two-pane computer layout: render, scan with axe, and check the main flow still works.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync, readFileSync } from "node:fs";

const BASE = "http://localhost:3100";
const OUT = new URL("./shots/dark", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url).pathname, "utf8");
const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const results = {};
const shot = async (p, n) => { await p.waitForTimeout(1000); await p.screenshot({ path: `${OUT}/${n}.png` }); };
async function axe(p, name) {
  await p.addScriptTag({ content: AXE });
  results[name] = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations
    .map((v) => `${v.impact}:${v.id}(${v.nodes.length}) ${v.nodes.slice(0, 2).map((x) => x.target.join(" ")).join(" | ")}`));
}
async function signIn(p, name, number) {
  await p.goto(`${BASE}/signin?next=/`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  await p.getByRole("button", { name: "Send me a code" }).click();
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  await p.getByLabel("Code").fill(await p.locator("[data-test-code]").getAttribute("data-test-code"));
  await p.getByRole("button", { name: "Verify" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

const darkPhone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark", permissions: ["microphone", "camera"] };
const A = await (await browser.newContext(darkPhone)).newPage();
const B = await (await browser.newContext(darkPhone)).newPage();
await signIn(A, "Lwazi Dlamini", "082 555 8101");
await signIn(B, "Thabo Nkosi", "083 555 8202");
await A.goto(`${BASE}/chats/new`);
await A.getByLabel("Their mobile number").fill("083 555 8202");
await A.getByRole("button", { name: "Open chat" }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Hey Thabo! Braai on Saturday?");
await A.getByRole("button", { name: "Send", exact: true }).click();
await B.goto(chatUrl);
await B.getByText("Braai on Saturday").waitFor();
await B.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("100% 🔥 I'll bring the boerewors");
await B.getByRole("button", { name: "Send", exact: true }).click();
await A.getByText("boerewors").waitFor();
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("@common braai at mine this weekend");
await A.getByRole("button", { name: "Send", exact: true }).click();
await A.getByRole("button", { name: "Open voting in this chat" }).waitFor({ timeout: 20000 });
await A.getByRole("button", { name: "Open voting in this chat" }).click();
await B.getByRole("button", { name: /^Works for me/ }).first().waitFor({ timeout: 15000 });
await B.getByRole("button", { name: /^Works for me/ }).first().click();
await shot(B, "01-dark-thread"); await axe(B, "dark-thread");
await B.goto(BASE); await shot(B, "02-dark-chats"); await axe(B, "dark-chats");
await B.goto(`${chatUrl}/info`); await shot(B, "03-dark-info"); await axe(B, "dark-info");
await B.goto(`${BASE}/you`); await shot(B, "04-dark-you"); await axe(B, "dark-you");
await B.goto(`${BASE}/plans`); await shot(B, "05-dark-plans"); await axe(B, "dark-plans");
await B.goto(`${BASE}/signin`); // signed in, but render the form anyway for dark contrast
await shot(B, "06-dark-signin");

// Computer: two panes, light and dark
for (const scheme of ["light", "dark"]) {
  const D = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme })).newPage();
  await D.context().addCookies(await A.context().cookies());
  await D.goto(BASE); await shot(D, `07-desktop-home-${scheme}`); await axe(D, `desktop-home-${scheme}`);
  await D.getByRole("complementary", { name: "Chats" }).getByText("Thabo Nkosi").click();
  await D.waitForURL((u) => /^\/chats\//.test(u.pathname));
  await D.getByText("boerewors").waitFor({ timeout: 15000 }).catch(() => {});
  await shot(D, `08-desktop-chat-${scheme}`); await axe(D, `desktop-chat-${scheme}`);
  await D.goto(`${BASE}/you`); await shot(D, `09-desktop-you-${scheme}`);
}
for (const [k, v] of Object.entries(results)) console.log(k, v.length ? v.join("  ;  ") : "clean");
await browser.close();
