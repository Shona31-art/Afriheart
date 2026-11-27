import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "gw-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
const TOKEN = "t".repeat(40);

const otp = await import("@/lib/otp");
const gw = await import("@/lib/sms-gateway");
const { getStore } = await import("@/lib/store");

afterEach(() => {
  delete process.env.SMS_GATEWAY_TOKEN;
  delete process.env.BULKSMS_TOKEN_ID;
});

describe("Afriheart's own gateway phone", () => {
  it("is switched on by a long enough key, and paid senders take priority", () => {
    process.env.SMS_GATEWAY_TOKEN = "short";
    expect(otp.otpProvider()).not.toBe("phone");
    process.env.SMS_GATEWAY_TOKEN = TOKEN;
    expect(otp.otpProvider()).toBe("phone");
    process.env.BULKSMS_TOKEN_ID = "id";
    expect(otp.otpProvider()).toBe("bulksms");
  });

  it("only lets in the phone with the right key", () => {
    process.env.SMS_GATEWAY_TOKEN = TOKEN;
    expect(gw.gatewayAuthorized(`Bearer ${TOKEN}`)).toBe(true);
    expect(gw.gatewayAuthorized("Bearer wrong")).toBe(false);
    expect(gw.gatewayAuthorized(null)).toBe(false);
    delete process.env.SMS_GATEWAY_TOKEN;
    expect(gw.gatewayAuthorized(`Bearer ${TOKEN}`)).toBe(false);
  });

  it("queues the code, hands it to the phone once, and forgets the text after it's sent", async () => {
    process.env.SMS_GATEWAY_TOKEN = TOKEN;
    const { phone, testCode } = await otp.requestCode("082 555 0201", "2.2.2.1");
    expect(testCode).toBeNull();
    const first = await gw.exchange([]);
    expect(first).toHaveLength(1);
    expect(first[0].to).toBe(`+${phone}`);
    expect(first[0].content).toMatch(/^\d{6} is your Afriheart code/);
    expect(await gw.exchange([])).toHaveLength(0); // not handed out twice while the phone is sending
    await gw.exchange([{ id: first[0].id, status: "SENT" }]);
    const row = await getStore().get("sms_outbox", first[0].id);
    expect(row?.status).toBe("sent");
    expect(row?.body).toBe("");
  });

  it("retries a failed or unanswered text, but never after the code has expired", async () => {
    process.env.SMS_GATEWAY_TOKEN = TOKEN;
    await gw.queueSms("27825550202", "123456 is your Afriheart code.");
    const now = Date.now();
    const [m] = await gw.exchange([], now);
    expect(await gw.exchange([{ id: m.id, status: "FAILED", reason: "no signal" }], now + 1000)).toHaveLength(1);
    expect(await gw.exchange([], now + 2000)).toHaveLength(0);
    expect(await gw.exchange([], now + 2000 + 91_000)).toHaveLength(1); // phone never answered: offered again
    expect(await gw.exchange([], now + 11 * 60_000)).toHaveLength(0); // expired
    expect((await getStore().get("sms_outbox", m.id))?.status).toBe("failed");
  });
});
