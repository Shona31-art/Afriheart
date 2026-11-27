import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "adm-"));
process.env.LOCAL_DB_PATH = path.join(dir, "db.json");
const { checkAdminPassword, adminPasswordOn } = await import("@/lib/admin-login");

const PASSWORD = "correct horse battery staple";
afterEach(() => { delete process.env.SUPER_ADMIN_PASSWORD; delete process.env.SUPER_ADMIN_PHONES; });
const on = () => { process.env.SUPER_ADMIN_PASSWORD = PASSWORD; process.env.SUPER_ADMIN_PHONES = "0764220052"; };

describe("super admin password sign-in", () => {
  it("is off without a long password and a super admin number", () => {
    expect(adminPasswordOn()).toBe(false);
    process.env.SUPER_ADMIN_PASSWORD = "short";
    process.env.SUPER_ADMIN_PHONES = "0764220052";
    expect(adminPasswordOn()).toBe(false);
    on();
    expect(adminPasswordOn()).toBe(true);
  });

  it("lets in the super admin number with the right password", async () => {
    on();
    expect(await checkAdminPassword("076 422 0052", PASSWORD, "1.0.0.1")).toBe("27764220052");
  });

  it("refuses a wrong password or any other number, with the same message", async () => {
    on();
    await expect(checkAdminPassword("076 422 0052", "wrong password here!!", "1.0.0.2")).rejects.toThrow("number or password isn't right");
    await expect(checkAdminPassword("082 555 0101", PASSWORD, "1.0.0.3")).rejects.toThrow("number or password isn't right");
  });

  it("stops guessing after a few tries from one network", async () => {
    on();
    for (let i = 0; i < 5; i++) await checkAdminPassword("076 422 0052", `guess number ${i}xxxxxxx`, "1.0.0.9").catch(() => {});
    await expect(checkAdminPassword("076 422 0052", PASSWORD, "1.0.0.9")).rejects.toThrow("Too many admin password tries");
  });
});
