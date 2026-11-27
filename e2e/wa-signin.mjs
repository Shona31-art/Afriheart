// WhatsApp sign-in, end to end: choose WhatsApp, see the code, Meta's webhook arrives, signed in.
import { chromium, devices } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { createHmac } from "node:crypto";
const BASE = "http://localhost:3100";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
const ok = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("ok -", m); };

async function webhook(from, body, secret = "app-secret") {
  const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: from }], messages: [{ from, id: "wamid.x", type: "text", text: { body } }] } }] }] });
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return fetch(`${BASE}/api/whatsapp/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body: raw });
}

// Meta's webhook check
let r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242`);
ok(r.status === 200 && (await r.text()) === "4242", "Meta can verify the webhook");
r = await fetch(`${BASE}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=4242`);
ok(r.status === 403, "wrong verify token refused");
ok((await webhook("27825550401", "Afriheart code 000000", "forged")).status === 403, "forged webhook refused");

await page.goto(`${BASE}/signin`);
await page.getByLabel("Your name").fill("Thandi");
await page.getByLabel("Mobile number").fill("082 555 0401");
ok(await page.getByRole("button", { name: "Send me an SMS code instead" }).isVisible(), "SMS shown as the backup");
await page.screenshot({ path: "/home/claude/e2e/wa1-choose.png" });
await page.getByRole("button", { name: "Verify with WhatsApp" }).click();
await page.waitForSelector("[data-wa-code]");
const code = await page.getAttribute("[data-wa-code]", "data-wa-code");
ok(/^\d{6}$/.test(code), "code shown: " + code);
const href = await page.getByRole("link", { name: "Open WhatsApp" }).getAttribute("href");
ok(href.startsWith("https://wa.me/27600000001?text=") && decodeURIComponent(href).includes(code), "Open WhatsApp link has the message");
await page.waitForTimeout(500);
await page.screenshot({ path: "/home/claude/e2e/wa2-waiting.png" });

// Wrong number first
await webhook("27839998877", `Afriheart code ${code}. I'm signing in to Afriheart myself.`);
await page.getByText("different WhatsApp number").waitFor({ timeout: 8000 });
ok(await page.getByText("ending 8877").isVisible(), "wrong number explained");
await page.screenshot({ path: "/home/claude/e2e/wa3-mismatch.png" });

// Start again, then the right number
await page.getByRole("link", { name: "start again with that number" }).click();
await page.getByLabel("Mobile number").fill("082 555 0401");
await page.waitForTimeout(21000); // the resend wait
await page.getByRole("button", { name: "Verify with WhatsApp" }).click();
await page.waitForSelector("[data-wa-code]");
const code2 = await page.getAttribute("[data-wa-code]", "data-wa-code");
const res = await webhook("27825550401", `Afriheart code ${code2}. I'm signing in to Afriheart myself.`);
ok(res.status === 200, "webhook accepted");
await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15000 });
ok(true, "signed in automatically, now at " + new URL(page.url()).pathname);
await page.screenshot({ path: "/home/claude/e2e/wa4-signed-in.png" });

// Another browser can't hijack with the same id
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
const st = await p2.request.get(`${BASE}/api/whatsapp/signin/00000000-0000-0000-0000-000000000000`);
ok((await st.json()).status === "expired", "status needs the starting browser");
await browser.close();
console.log("ALL PASSED");
