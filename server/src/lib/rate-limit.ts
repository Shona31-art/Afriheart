import "server-only";
import { getStore } from "./store";
import { DomainError } from "./domain";

// Simple fixed-window limits, stored with the rest of the data so they hold
// across server instances. Counts are approximate under heavy concurrency,
// which is fine for stopping floods and spam.

export const LIMITS = {
  swipe: { max: 300, windowS: 3600, msg: "You've been swiping a lot. Take a break and try again in a bit." },
  report: { max: 10, windowS: 86400, msg: "You've sent a lot of reports today. If you're in danger, call 10111 or 112." },
  message: { max: 60, windowS: 60, msg: "You're sending messages very fast. Wait a moment." },
  upload: { max: 40, windowS: 600, msg: "Too many uploads. Wait a few minutes and try again." },
  photo: { max: 30, windowS: 3600, msg: "Too many photo uploads. Try again in an hour." },
  verify: { max: 5, windowS: 86400, msg: "You've tried verifying a lot today. Try again tomorrow." },
  write: { max: 120, windowS: 60, msg: "That's a lot of changes at once. Wait a moment and try again." },
  chat: { max: 30, windowS: 3600, msg: "You've started a lot of chats. Try again later." },
  plan: { max: 30, windowS: 3600, msg: "You've made a lot of plans. Try again later." },
  call: { max: 30, windowS: 3600, msg: "You've started a lot of calls. Try again later." },
  quiz: { max: 20, windowS: 3600, msg: "That's a lot of quizzes. Try again in a while." },
  vouch: { max: 20, windowS: 86400, msg: "That's a lot of vouches for one day. Try again tomorrow." },
  checkout: { max: 20, windowS: 3600, msg: "You've started a lot of payments. Try again in an hour." },
  adminLogin: { max: 5, windowS: 3600, msg: "Too many admin password tries. Wait an hour, or sign in with a code instead." },
  adminLoginAll: { max: 30, windowS: 3600, msg: "Admin password sign-in is paused for an hour after many wrong tries. Sign in with a code instead." },
  support: { max: 6, windowS: 3600, msg: "You've sent a few requests already. We'll get back to you; try again in an hour if it's urgent." },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Counts one action and refuses it once the limit for the window is reached. */
export async function limit(name: LimitName, who: string) {
  const { max, windowS, msg } = LIMITS[name];
  const now = Date.now();
  const start = Math.floor(now / (windowS * 1000)) * windowS * 1000;
  const id = `${name}:${who}:${start}`;
  const store = getStore();
  const row = await store.get("rate_limits", id);
  if (row && row.count >= max) throw new DomainError(msg, 429);
  if (row) await store.update("rate_limits", id, { count: row.count + 1 });
  else await store.insert("rate_limits", { id, count: 1, expires_at: new Date(start + windowS * 1000).toISOString() }).catch(async () => {
    const again = await store.get("rate_limits", id); // two requests raced to create it
    if (again) await store.update("rate_limits", id, { count: again.count + 1 });
  });
}
