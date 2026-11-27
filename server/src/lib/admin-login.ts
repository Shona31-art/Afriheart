import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError, normalizePhone } from "./domain";
import { phones } from "./admin";
import { limit } from "./rate-limit";

// Super admins can sign in with their number plus a private password instead of a
// code (so they're never locked out while sign-in codes are being set up).
// Only numbers in SUPER_ADMIN_PHONES, only with SUPER_ADMIN_PASSWORD (16+ characters,
// set in Vercel by the owner, never stored in the code). Tries are rate-limited per
// network and overall, and every success is written to the admin activity log.

export function adminPasswordOn(): boolean {
  return (process.env.SUPER_ADMIN_PASSWORD ?? "").length >= 16 && phones(process.env.SUPER_ADMIN_PHONES).length > 0;
}

const WRONG = "That number or password isn't right.";

/** Returns the verified super-admin phone, or throws the same message for any mistake. */
export async function checkAdminPassword(rawPhone: string, password: string, ip: string): Promise<string> {
  if (!adminPasswordOn()) throw new DomainError("Admin password sign-in isn't switched on.");
  await limit("adminLogin", `ip:${ip}`);
  await limit("adminLoginAll", "all");
  const phone = normalizePhone(rawPhone);
  const a = createHash("sha256").update(password).digest();
  const b = createHash("sha256").update(process.env.SUPER_ADMIN_PASSWORD ?? "").digest();
  const passwordOk = timingSafeEqual(a, b);
  if (!phone || !phones(process.env.SUPER_ADMIN_PHONES).includes(phone) || !passwordOk) throw new DomainError(WRONG);
  return phone;
}
