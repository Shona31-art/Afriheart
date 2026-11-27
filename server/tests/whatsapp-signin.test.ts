import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "wa-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
process.env.WHATSAPP_NUMBER = "27600000001";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
process.env.WHATSAPP_APP_SECRET = "app-secret";

const wa = await import("@/lib/whatsapp-signin");

const incoming = (from: string, body: string, extra: Record<string, unknown> = {}) => ({
  entry: [{ changes: [{ value: { contacts: [{ wa_id: from }], messages: [{ from, type: "text", text: { body }, ...extra }] } }] }],
});

let ip = 0;
const nextIp = () => `9.9.9.${++ip}`;

describe("sign in by sending a WhatsApp message", () => {
  beforeEach(() => { process.env.WHATSAPP_APP_SECRET = "app-secret"; });

  it("is only on when all three settings are there", () => {
    expect(wa.whatsappSignInOn()).toBe(true);
    delete process.env.WHATSAPP_APP_SECRET;
    expect(wa.whatsappSignInOn()).toBe(false);
  });

  it("opens WhatsApp with the code typed, to Afriheart's number", async () => {
    const s = await wa.startWhatsAppSignIn("082 555 0301", nextIp());
    const link = wa.whatsappLink(s.code);
    expect(link.startsWith("https://wa.me/27600000001?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1])).toContain(`Afriheart code ${s.code}`);
  });

  it("signs in the browser that started, once the message comes from the same number", async () => {
    const s = await wa.startWhatsAppSignIn("082 555 0302", nextIp());
    expect((await wa.whatsappStatus(s.id, s.browserSecret))?.status).toBe("pending");
    await expect(wa.finishWhatsAppSignIn(s.id, s.browserSecret)).rejects.toThrow("haven't received");
    expect(await wa.handleWhatsAppWebhook(incoming("27825550302", wa.messageFor(s.code)))).toBe(1);
    expect((await wa.whatsappStatus(s.id, s.browserSecret))?.status).toBe("confirmed");
    // Someone who only knows the sign-in's ID can't use it.
    await expect(wa.finishWhatsAppSignIn(s.id, "not-the-browser")).rejects.toThrow("expired");
    expect(await wa.finishWhatsAppSignIn(s.id, s.browserSecret)).toBe("27825550302");
    await expect(wa.finishWhatsAppSignIn(s.id, s.browserSecret)).rejects.toThrow("already signed in");
  });

  it("refuses a message from a different number, and says which", async () => {
    const s = await wa.startWhatsAppSignIn("082 555 0303", nextIp());
    await wa.handleWhatsAppWebhook(incoming("27839998877", `Afriheart code ${s.code}`));
    expect(await wa.whatsappStatus(s.id, s.browserSecret)).toEqual({ status: "mismatch", hint: "8877" });
    await expect(wa.finishWhatsAppSignIn(s.id, s.browserSecret)).rejects.toThrow();
  });

  it("can't check people whose WhatsApp username hides their number", async () => {
    const s = await wa.startWhatsAppSignIn("082 555 0304", nextIp());
    await wa.handleWhatsAppWebhook({
      entry: [{ changes: [{ value: { contacts: [{}], messages: [{ from: "ZA.1A2B3C4D5E", user_id: "ZA.1A2B3C4D5E", type: "text", text: { body: `Afriheart code ${s.code}` } }] } }] }],
    });
    expect((await wa.whatsappStatus(s.id, s.browserSecret))?.status).toBe("hidden");
  });

  it("ignores late messages and unrelated chat", async () => {
    const s = await wa.startWhatsAppSignIn("082 555 0305", nextIp());
    expect(await wa.handleWhatsAppWebhook(incoming("27825550305", "hello there"))).toBe(0);
    await wa.handleWhatsAppWebhook(incoming("27825550305", `Afriheart code ${s.code}`), Date.now() + 11 * 60_000);
    expect((await wa.whatsappStatus(s.id, s.browserSecret))?.status).toBe("expired");
  });

  it("only trusts webhooks signed with the Meta app secret", () => {
    const body = JSON.stringify(incoming("27825550306", "Afriheart code 123456"));
    const good = "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(wa.validMetaSignature(body, good)).toBe(true);
    expect(wa.validMetaSignature(body + " ", good)).toBe(false);
    expect(wa.validMetaSignature(body, "sha256=00")).toBe(false);
    expect(wa.validMetaSignature(body, null)).toBe(false);
  });

  it("limits how often one number can try", async () => {
    await wa.startWhatsAppSignIn("082 555 0307", nextIp());
    await expect(wa.startWhatsAppSignIn("082 555 0307", nextIp())).rejects.toThrow("Wait a moment");
  });
});
