import "server-only";
import { createHash } from "node:crypto";
import { getStore } from "./store";
import { staffRole } from "./admin";

// Afriheart is a paid app. After the free trial (7 days, or longer for founding members),
// people without a membership can still do the things that keep them safe and in control
// of their account: report, block, unmatch, get support, edit or delete their profile and
// account, and pay. Everything else waits for a membership.
//
// Checked in one place (src/proxy.ts) in front of every page and API call, so a locked
// screen can't be reached by a link or a soft navigation either. The Afriheart team is
// never locked out. Signed-out visitors pass through: pages send them to sign in.

const FREE_PAGES: RegExp[] = [
  /^\/signin(\/|$)/, /^\/plus(\/|$)/, /^\/you$/, /^\/support(\/|$)/, /^\/privacy$/, /^\/terms$/,
  /^\/dating\/(profile|safety|verify|questions)$/, /^\/admin$/, /^\/team$/, /^\/start$/,
  /^\/quiz(\/|$)/, /^\/vouch\//, // shared with friends, who may not be members
];

const FREE_API: RegExp[] = [
  /^\/api\/account(\/|$)/, /^\/api\/plus(\/|$)/, /^\/api\/support(\/|$)/, /^\/api\/privacy(\/|$)/,
  /^\/api\/dating\/(profile|photos|voice|verify|answers|report|block|unmatch)(\/|$)/,
  /^\/api\/admin(\/|$)/, /^\/api\/team(\/|$)/, /^\/api\/announcement$/,
  /^\/api\/devices(\/|$)/, /^\/api\/rekey(\/|$)/, /^\/api\/sync(\/|$)/, /^\/api\/android(\/|$)/, /^\/api\/events(\/|$)/,
  /^\/api\/media\/support-/, /^\/api\/vouch(es)?(\/|$)/, /^\/api\/quiz(\/|$)/,
  /^\/api\/whatsapp(\/|$)/, /^\/api\/sms-gateway$/,
];

export const isFreePath = (path: string) => (path.startsWith("/api/") ? FREE_API : FREE_PAGES).some((re) => re.test(path));

export type Gate = { allow: true } | { allow: false; api: boolean; to: string };

const COOKIE = "common_session";

/** Who's signed in, from the session cookie (the proxy can't use next/headers). */
async function personFromToken(token: string | undefined): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const s = await getStore().get("sessions", createHash("sha256").update(token).digest("hex"));
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= Date.now()) return null;
  return s.person_id;
}

export async function isMember(personId: string): Promise<boolean> {
  const m = await getStore().get("memberships", personId);
  return !!m && m.plus_until > new Date().toISOString();
}

/** Where someone should land: `next` if they may use it, otherwise their profile or Membership. */
export async function landingFor(personId: string, next: string): Promise<string> {
  const path = next.split("?")[0] || "/";
  if (process.env.PAID_APP === "off" || isFreePath(path)) return next;
  if ((await isMember(personId)) || (await staffRole(personId))) return next;
  return (await getStore().get("dating_profiles", personId)) ? "/plus?locked=1" : "/dating/profile";
}

/** Decides whether this request may go ahead. */
export async function gate(path: string, cookies: { get(name: string): { value: string } | undefined }): Promise<Gate> {
  if (process.env.PAID_APP === "off" || isFreePath(path)) return { allow: true };
  const personId = await personFromToken(cookies.get(COOKIE)?.value);
  if (!personId) return { allow: true }; // signed out: the page itself asks them to sign in
  if (await isMember(personId)) return { allow: true };
  if (await staffRole(personId)) return { allow: true };
  // No dating profile yet: that's where the free trial starts, so send them there first.
  const profile = await getStore().get("dating_profiles", personId);
  return { allow: false, api: path.startsWith("/api/"), to: profile ? "/plus?locked=1" : "/dating/profile" };
}
