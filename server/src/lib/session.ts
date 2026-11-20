import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getStore } from "./store";

// Sign-in sessions, kept on the server so they can be ended.
//
// The cookie holds a random token. Only a hash of it is stored (as the
// session id), so a database leak doesn't hand out working sessions. Signing
// out, removing a linked device, or deleting the account ends the session on
// the server: a copied cookie stops working straight away.

const COOKIE = "common_session";
const DAY = 24 * 60 * 60 * 1000;
const LIFETIME = 90 * DAY; // sliding: extended when used, up to 90 days from the last visit
const TOUCH_EVERY = DAY; // write last_seen at most once a day per session

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface Session { id: string; person_id: string }

async function readToken(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
}

export async function getSession(): Promise<Session | null> {
  const token = await readToken();
  if (!token) return null;
  const store = getStore();
  const s = await store.get("sessions", hashToken(token));
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= Date.now()) return null;
  // Banned people are signed out everywhere (their sessions are also ended when they're banned).
  const person = await store.get("people", s.person_id);
  if (person?.banned_at) return null;
  if (Date.now() - Date.parse(s.last_seen_at) > TOUCH_EVERY) {
    const now = new Date();
    await store.update("sessions", s.id, { last_seen_at: now.toISOString(), expires_at: new Date(now.getTime() + LIFETIME).toISOString() }).catch(() => undefined);
  }
  return { id: s.id, person_id: s.person_id };
}

export async function getSessionPersonId(): Promise<string | null> {
  return (await getSession())?.person_id ?? null;
}

export async function setSession(personId: string, userAgent = "") {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await getStore().insert("sessions", {
    id: hashToken(token), person_id: personId, device_id: null, user_agent: userAgent.slice(0, 200),
    created_at: now.toISOString(), last_seen_at: now.toISOString(), expires_at: new Date(now.getTime() + LIFETIME).toISOString(), revoked_at: null,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LIFETIME / 1000,
  });
}

/** Ends this session on the server and removes the cookie. */
export async function clearSession() {
  const s = await getSession();
  if (s) await getStore().update("sessions", s.id, { revoked_at: new Date().toISOString() });
  (await cookies()).delete(COOKIE);
}

/** Remembers which encryption device this session registered, so removing the device signs it out. */
export async function linkSessionToDevice(deviceId: string) {
  const s = await getSession();
  if (s) await getStore().update("sessions", s.id, { device_id: deviceId });
}

/** Ends sessions on the server: all of a person's, or only those of one device. */
export async function revokeSessions(personId: string, opts: { deviceId?: string; except?: string } = {}) {
  const store = getStore();
  const at = new Date().toISOString();
  for (const s of await store.list("sessions", { person_id: personId })) {
    if (s.revoked_at || s.id === opts.except) continue;
    if (opts.deviceId && s.device_id !== opts.deviceId) continue;
    await store.update("sessions", s.id, { revoked_at: at });
  }
}
