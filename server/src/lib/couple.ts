import "server-only";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { chatMembers, membership, postMessage, stamp } from "./chat";
import { localParts } from "./time";
import { COUPLE_QUESTIONS, questionIndex } from "./couple-questions";

// Couple space: a home for two people in a chat (usually a match that became something). The
// question of the day (answers end-to-end encrypted, opened when you've both answered), how long
// you've been together, the countdown to your next date, and your Alphabet date ideas progress.

const pad = (n: number) => String(n).padStart(2, "0");
export function localDate(at = new Date()): string {
  const p = localParts(at);
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);

async function pair(chatId: string, personId: string) {
  await membership(chatId, personId);
  const chat = await getStore().get("chats", chatId);
  const members = await chatMembers(chatId);
  if (chat?.kind !== "direct" || members.length !== 2) throw new DomainError("Couple space is for chats between two people.");
  const partner = members.find((m) => m.person.id !== personId)!.person;
  return { chat, partner };
}

export interface CoupleView {
  partner: { id: string; name: string };
  today: string;
  question: string;
  mine: string | null;
  /** Their encrypted answer: only once you've both answered. */
  theirs: string | null;
  partner_answered: boolean;
  /** Days in a row you've both answered. */
  streak: number;
  together_since: string;
  days_together: number;
  next_anniversary: { date: string; in_days: number; years: number };
  next_date: { title: string; starts_at: string; slug: string; in_days: number } | null;
  az_done: number;
}

export async function coupleSpace(chatId: string, personId: string): Promise<CoupleView> {
  const { chat, partner } = await pair(chatId, personId);
  const store = getStore();
  const today = localDate();
  const answers = await store.list("couple_answers", { chat_id: chatId });
  const byDay = new Map<string, Set<string>>();
  for (const a of answers) byDay.set(a.date, (byDay.get(a.date) ?? new Set()).add(a.person_id));
  const both = (d: string) => (byDay.get(d)?.size ?? 0) >= 2;
  // A streak counts back from today (or from yesterday, if today isn't finished yet).
  let streak = 0;
  for (let d = both(today) ? today : addDays(today, -1); both(d); d = addDays(d, -1)) streak++;
  const mine = answers.find((a) => a.date === today && a.person_id === personId) ?? null;
  const theirs = answers.find((a) => a.date === today && a.person_id === partner.id) ?? null;

  const couple = await store.get("couples", chatId);
  const match = (await store.list("matches", { chat_id: chatId }))[0];
  const since = couple?.together_since ?? localDate(new Date(match?.created_at ?? chat.created_at));
  const daysTogether = Math.max(0, daysBetween(since, today));
  // The next anniversary of the day you got together.
  const [sy, sm, sd] = since.split("-").map(Number);
  // (29 February, or the 31st, falls on the last day of the month in shorter years.)
  const onYear = (y: number) => `${y}-${pad(sm)}-${pad(Math.min(sd, new Date(Date.UTC(y, sm, 0)).getUTCDate()))}`;
  let year = Number(today.slice(0, 4));
  let anniv = onYear(year);
  if (anniv <= today) anniv = onYear(++year);

  // The next date: the soonest plan in this chat with a time decided.
  const now = new Date().toISOString();
  let next: CoupleView["next_date"] = null;
  for (const p of await store.list("plans", { chat_id: chatId })) {
    if (!p.locked_option_id || p.state === "dropped") continue;
    const o = await store.get("plan_options", p.locked_option_id);
    if (o && o.starts_at > now && (!next || o.starts_at < next.starts_at)) next = { title: p.title, starts_at: o.starts_at, slug: p.slug, in_days: daysBetween(today, localDate(new Date(o.starts_at))) };
  }
  const az = (await store.list("az_dates", { chat_id: chatId })).filter((d) => d.status === "done").length;

  return {
    partner: { id: partner.id, name: partner.name },
    today,
    question: COUPLE_QUESTIONS[questionIndex(chatId, today)],
    mine: mine?.cipher ?? null,
    theirs: mine && theirs ? theirs.cipher : null,
    partner_answered: !!theirs,
    streak,
    together_since: since,
    days_together: daysTogether,
    next_anniversary: { date: anniv, in_days: daysBetween(today, anniv), years: year - sy },
    next_date: next,
    az_done: az,
  };
}

/** Your answer to today's question, sealed on your phone for both of your phones. Change it until they answer. */
export async function answerToday(chatId: string, personId: string, cipher: string, date: string) {
  const { partner } = await pair(chatId, personId);
  const today = localDate();
  // Answering just after midnight still counts for the question you were looking at.
  if (date !== today && date !== addDays(today, -1)) throw new DomainError("That question has changed. Have a look at today's.");
  if (typeof cipher !== "string" || cipher.length > 24_000) throw new DomainError("That answer is too long.");
  try {
    const env = JSON.parse(cipher);
    if (!env || typeof env !== "object" || typeof env.sd !== "string") throw new Error();
  } catch {
    throw new DomainError("That answer couldn't be read. Try again.");
  }
  const store = getStore();
  const id = `${chatId}:${date}:${personId}`;
  const theirs = await store.get("couple_answers", `${chatId}:${date}:${partner.id}`);
  const existing = await store.get("couple_answers", id);
  if (existing && theirs) throw new DomainError("You've both answered, so answers are locked for today.");
  if (existing) await store.update("couple_answers", id, { cipher, created_at: stamp() });
  else await store.insert("couple_answers", { id, chat_id: chatId, date, person_id: personId, cipher, created_at: stamp() });
  if (theirs && !existing) await postMessage(chatId, null, "system", "You've both answered today's question. Open Couple space to see each other's answers.");
  return { ok: true };
}

/** When you got together (a date, not in the future). */
export async function setTogetherSince(chatId: string, personId: string, date: string) {
  await pair(chatId, personId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > localDate() || date < "1950-01-01") throw new DomainError("Choose a date that's already happened.");
  const store = getStore();
  const at = stamp();
  if (await store.get("couples", chatId)) await store.update("couples", chatId, { together_since: date, updated_by: personId, updated_at: at });
  else await store.insert("couples", { id: chatId, chat_id: chatId, together_since: date, updated_by: personId, updated_at: at });
  return { ok: true };
}
