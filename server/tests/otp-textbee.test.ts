import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "otp-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");

const otp = await import("@/lib/otp");

const KEYS = ["OTP_PROVIDER", "MAKE_WEBHOOK_URL", "TWILIO_ACCOUNT_SID", "BULKSMS_TOKEN_ID", "TEXTBEE_API_KEY", "TEXTBEE_DEVICE_ID"];
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("sign-in codes through your own phone (textbee)", () => {
  it("is used when its key is set, and a paid sender takes over when added", () => {
    process.env.TEXTBEE_API_KEY = "tb-key";
    expect(otp.otpProvider()).toBe("textbee");
    process.env.BULKSMS_TOKEN_ID = "id";
    expect(otp.otpProvider()).toBe("bulksms");
  });

  it("asks textbee to text the code to the number", async () => {
    process.env.TEXTBEE_API_KEY = "tb-key";
    process.env.TEXTBEE_DEVICE_ID = "dev-1";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { phone, testCode } = await otp.requestCode("082 555 0101", "1.1.1.1");
    expect(testCode).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.textbee.dev/api/v1/gateway/send-sms");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("tb-key");
    const body = JSON.parse(String(init.body));
    expect(body.recipients).toEqual([`+${phone}`]);
    expect(body.deviceId).toBe("dev-1");
    expect(body.message).toMatch(/^\d{6} is your Afriheart code/);
  });

  it("shows a friendly error when the phone can't send", async () => {
    process.env.TEXTBEE_API_KEY = "tb-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(otp.requestCode("082 555 0102", "1.1.1.2")).rejects.toThrow("We couldn't send the code");
  });
});
