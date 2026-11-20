// End-to-end run of the whole Follow-Through Loop against a running server.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const DB = process.env.DB || "/tmp/common-e2e.json";
const SHOTS = new URL("./shots", import.meta.url).pathname;
import("node:fs").then((fs) => fs.mkdirSync(SHOTS, { recursive: true }));
const seen = (loc) => loc.filter({ visible: true }).first().waitFor({ timeout: 10000 }).then(() => true, () => false); // Next keeps recent pages mounted but hidden
const log = (...a) => console.log("•", ...a);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); log("ok:", m); };

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const org = await (await browser.newContext(phone)).newPage();
const guest = await (await browser.newContext(phone)).newPage();
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });

// 1. Landing and sign-in
await org.goto(BASE);
await shot(org, "01-welcome");
await org.goto(`${BASE}/signin?next=/start`);
await org.getByLabel("Your name").fill("Lwazi Dlamini");
await org.getByLabel("Mobile number").fill("082 555 0101");
await org.getByRole("button", { name: "Send me a code" }).click();
await org.waitForURL((u) => u.searchParams.get("step") === "code");
await org.getByLabel("Code").fill(await org.locator("[data-test-code]").getAttribute("data-test-code"));
await org.getByRole("button", { name: "Verify" }).click();
await org.waitForURL((u) => u.pathname === "/start");
await shot(org, "02-start");

// 2. Spark → proposal
await org.getByLabel("Your idea").fill("Trail run at Giba Gorge on Sunday morning with the crew");
await org.getByRole("button", { name: "Shape it" }).click();
await org.waitForURL("**/p/*");
const planUrl = org.url();
const slug = planUrl.split("/p/")[1];
assert(await seen(org.getByText("Draft").first()), "plan starts as a draft");
assert((await org.getByText(/Giba Gorge/).count()) > 0, "companion proposed the Giba Gorge option");
await shot(org, "03-draft");

// Guest can't see a draft
await guest.goto(planUrl);
assert(await seen(guest.getByText(/still shaping this plan/)), "guests can't see options before the poll opens");

// 3. Open the poll
await org.getByRole("button", { name: "Open the poll" }).click();
await org.waitForURL("**shared=1");
assert(await seen(org.getByRole("status").getByText("Poll is open")), "poll opened");
await shot(org, "04-voting-organiser");

// 4. Guest joins from the link, votes
await guest.goto(planUrl);
await guest.getByLabel("Your name").fill("Thabo");
await guest.getByLabel("Mobile number").fill("083 555 0202");
await guest.getByRole("button", { name: "Maybe" }).click();
await guest.waitForURL((u) => u.searchParams.get("step") === "code");
await guest.getByLabel("Code").fill(await guest.locator("[data-test-code]").getAttribute("data-test-code"));
await guest.getByRole("button", { name: "Verify" }).click();
await guest.waitForURL(`**/p/${slug}`);
await guest.getByRole("button", { name: "Works for me" }).first().click();
await guest.waitForLoadState("networkidle");
assert(await seen(guest.getByText("✓ Works for me").first()), "guest vote registered");
await shot(org, "05-guest-voted");
await shot(guest, "05-guest-view");

// 5. Lock attempt without quorum → friendly error
await org.reload();
await org.getByRole("button", { name: "Try to lock now" }).click();
await org.waitForLoadState("networkidle");
assert(await seen(org.getByRole("alert").getByText(/Needs 2 people in to lock/)), "lock blocked without quorum");

// 6. Nudge the maybe → prepared WhatsApp link
await org.getByRole("button", { name: /Draft nudges/ }).click();
await org.waitForLoadState("networkidle");
const nudge = org.getByRole("link", { name: "Send on WhatsApp" });
assert(await seen(nudge), "nudge prepared, not sent");
const href = await nudge.getAttribute("href");
assert(href.startsWith("https://wa.me/27835550202?text="), "nudge targets the guest's WhatsApp number");
await shot(org, "06-nudge");

// 7. Guest says In → nudge becomes done; organiser locks
await guest.getByRole("button", { name: "I'm in" }).click();
await guest.locator("button[aria-pressed='true']", { hasText: "I'm in" }).waitFor();
await org.reload();
assert(await seen(org.getByText("Nudge for Thabo · answered")), "answered nudge marked done");
await org.getByRole("button", { name: "Lock the leading option now" }).click();
await org.waitForLoadState("networkidle");
assert(await seen(org.getByText("It's on")), "plan locked");
await shot(org, "07-locked");

// .ics
const ics = await (await fetch(`${BASE}/p/${slug}/ics`)).text();
assert(ics.includes("BEGIN:VEVENT") && ics.includes("TRIGGER:-PT2H"), "calendar file has the event and a 2h alarm");

// 8. Move the start time into the check-in window (simulate Sunday morning)
const db = JSON.parse(readFileSync(DB, "utf8"));
const plan = db.plans.find((p) => p.slug === slug);
db.plan_options.find((o) => o.id === plan.locked_option_id).starts_at = new Date(Date.now() + 30 * 60000).toISOString();
writeFileSync(DB, JSON.stringify(db, null, 2));

// 9. Both check in → done
await org.goto(`${BASE}/plans`);
assert(await seen(org.getByRole("link", { name: /Check in/ })), "Now shows the check-in");
await shot(org, "08-now-checkin");
await org.goto(planUrl);
await org.getByRole("button", { name: /check in/i }).click();
await org.waitForLoadState("networkidle");
assert(await seen(org.getByText("You checked in")), "organiser checked in, plan not done yet");
await guest.reload();
await guest.getByRole("button", { name: /check in/i }).click();
await guest.waitForLoadState("networkidle");
assert(await seen(guest.getByText(/It happened\. 2 people checked in/)), "two check-ins complete the plan");
await guest.getByRole("button", { name: "Yes" }).click();
await guest.locator("button.chip-on", { hasText: "Yes" }).waitFor();

// 10. Organiser makes a Circle and starts the next plan
await org.reload();
assert(await seen(org.getByText(/1 person wants to do it again/)), "organiser sees the again vote");
await shot(org, "09-done");
await org.getByRole("button", { name: "Make a Circle" }).click();
await org.waitForURL("**/circles/*");
await shot(org, "10-circle");
await org.getByRole("button", { name: "Start the next one" }).click();
await org.waitForURL("**/p/*");
assert(org.url() !== planUrl, "next plan created in the Circle");

// 11. Guest sees the circle and the memory learned from the outcome
await guest.goto(`${BASE}/circles`);
assert((await guest.getByText("Trail run at Giba Gorge").count()) > 0, "guest is a Circle member");
await guest.goto(`${BASE}/you`);
assert(await seen(guest.getByText("Enjoys beach & outdoors plans")), "learned memory with evidence");
await shot(guest, "11-you");
await guest.getByRole("button", { name: "Forget" }).click();
await guest.waitForLoadState("networkidle");
assert(await guest.getByText("Enjoys beach & outdoors plans").waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false), "memory can be deleted");

// 12. Access rules
const before = (await org.locator("body").innerText()).length;
await guest.goto(org.url());
assert(await seen(guest.getByText(/still shaping/)), "circle member sees the new draft but not its options");
await org.goto(BASE);
await shot(org, "12-now");
console.log("\nALL CHECKS PASSED", before > 0 ? "" : "");
await browser.close();
