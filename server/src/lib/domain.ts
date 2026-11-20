import "server-only";
import { randomUUID, randomBytes } from "node:crypto";
import { getStore } from "./store";
import * as M from "./plan-machine";
import { propose } from "./companion";
import type {
  ActionKind, ActionStatus, Category, Circle, CompanionAction, Memory, Person, Plan, PlanBundle, PlanOption, Response,
} from "./types";
import { CATEGORY_LABELS } from "./types";

export class DomainError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const nowIso = () => new Date().toISOString();

/** The companion's voice in a plan's chat (no-op for plans made outside a chat). */
async function say(plan: Plan, text: string) {
  if (!plan.chat_id) return;
  const { announce } = await import("./chat");
  await announce(plan.chat_id, text);
}

async function whenText(iso: string) {
  const { formatWhen } = await import("./time");
  return formatWhen(iso);
}
const newId = () => randomUUID();
const newSlug = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);

// ── People ───────────────────────────────────────────────────────────────────

/** South African numbers: 082 123 4567 → 27821234567. Other countries: digits with country code. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 10) d = `27${d.slice(1)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export async function findPersonByPhone(phone: string): Promise<Person | null> {
  return (await getStore().list("people", { phone }))[0] ?? null;
}

export async function findOrCreatePerson(input: { name: string; phone: string; isGuest: boolean }): Promise<Person> {
  const name = input.name.trim().slice(0, 60);
  const phone = normalizePhone(input.phone);
  if (!name) throw new DomainError("Please add your name.");
  if (!phone) throw new DomainError("That phone number doesn't look right. Try 082 123 4567.");
  const store = getStore();
  const [existing] = await store.list("people", { phone });
  if (existing) {
    // Joining as a full member upgrades a guest account; a guest join never downgrades a member.
    if (existing.is_guest && !input.isGuest) return store.update("people", existing.id, { is_guest: false, name });
    return existing;
  }
  return store.insert("people", {
    id: newId(), name, phone, is_guest: input.isGuest, home_area: null, budget: null, availability: [], created_at: nowIso(),
  });
}

export async function getPerson(id: string | null): Promise<Person | null> {
  return id ? getStore().get("people", id) : null;
}

export async function updatePreferences(personId: string, patch: Pick<Person, "home_area" | "budget" | "availability" | "name">) {
  return getStore().update("people", personId, patch);
}

// ── Plans ────────────────────────────────────────────────────────────────────

async function logAction(planId: string, kind: ActionKind, status: ActionStatus, summary: string,
  extra: Partial<Pick<CompanionAction, "link" | "target_person_id">> = {}) {
  return getStore().insert("companion_actions", {
    id: newId(), plan_id: planId, kind, status, summary, link: extra.link ?? null,
    target_person_id: extra.target_person_id ?? null, created_at: nowIso(),
  });
}

async function loadBundle(plan: Plan): Promise<PlanBundle> {
  const store = getStore();
  const [options, votes, commitments, checkins, actions] = await Promise.all([
    store.list("plan_options", { plan_id: plan.id }),
    store.list("votes", { plan_id: plan.id }),
    store.list("commitments", { plan_id: plan.id }),
    store.list("checkins", { plan_id: plan.id }),
    store.list("companion_actions", { plan_id: plan.id }),
  ]);
  options.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  actions.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { plan, options, votes, commitments, checkins, actions };
}

async function savePlan(b: PlanBundle, patch: Partial<Plan>): Promise<PlanBundle> {
  const plan = await getStore().update("plans", b.plan.id, { ...patch, updated_at: nowIso() });
  return { ...b, plan };
}

/** Load a plan and apply any time-driven transition (auto-lock at the deadline). */
export async function getBundleBySlug(slug: string): Promise<PlanBundle | null> {
  const [plan] = await getStore().list("plans", { slug });
  if (!plan) return null;
  let b = await loadBundle(plan);
  const patch = M.autoAdvance(b, new Date());
  if (patch) {
    b = await savePlan(b, patch);
    const opt = M.lockedOption(b);
    await logAction(plan.id, "lock", "done", `Locked automatically at the deadline: ${opt?.what ?? "winning option"}.`);
    if (opt) await say(b.plan, `It's on: ${opt.what}, ${await whenText(opt.starts_at)} at ${opt.where_name}. Voting closed and it had the most votes. Check in when you get there.`);
    b = await loadBundle(b.plan);
  }
  return b;
}

async function requireBundle(slug: string): Promise<PlanBundle> {
  const b = await getBundleBySlug(slug);
  if (!b) throw new DomainError("That plan doesn't exist.");
  return b;
}

function requireOrganiser(b: PlanBundle, personId: string) {
  if (b.plan.organiser_id !== personId) throw new DomainError("Only the organiser can do that.");
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof M.TransitionError) throw new DomainError(e.message);
    throw e;
  }
}

export async function createPlanFromSpark(personId: string, spark: string, circleId: string | null = null, chatId: string | null = null): Promise<Plan> {
  const text = spark.trim().slice(0, 500);
  if (text.length < 3) throw new DomainError("Tell the companion a little about what you want to make happen.");
  const store = getStore();
  const person = await store.get("people", personId);
  if (!person) throw new DomainError("Please sign in first.");
  const memories = await store.list("memories", { person_id: personId });
  const now = new Date();
  const proposal = await propose({
    spark: text, now, homeArea: person.home_area, budget: person.budget, availability: person.availability,
    memories: memories.map((m) => m.text),
  });

  const plan = await store.insert("plans", {
    id: newId(), slug: newSlug(), organiser_id: personId, circle_id: circleId, chat_id: chatId, title: proposal.title, spark: text,
    category: proposal.category, state: "shaping", min_people: 2, decision_deadline: proposal.deadline,
    locked_option_id: null, ai_source: proposal.source, ai_reasoning: proposal.reasoning, created_at: nowIso(), updated_at: nowIso(),
  });
  for (const o of proposal.options) {
    await store.insert("plan_options", {
      id: newId(), plan_id: plan.id, what: o.what, where_name: o.where_name, starts_at: o.starts_at,
      est_cost_per_person: o.est_cost_per_person, note: o.note, source: "companion", created_by: null, created_at: nowIso(),
    });
  }
  await store.insert("commitments", { id: newId(), plan_id: plan.id, person_id: personId, response: "in", updated_at: nowIso() });
  await logAction(plan.id, "propose", "done",
    `Shaped your spark into ${proposal.options.length} option${proposal.options.length === 1 ? "" : "s"} (${proposal.source === "gemini" ? "AI" : "offline companion"}).`);
  await logAction(plan.id, "poll", "suggested", "Review the options, then send the poll to your group.");
  return plan;
}

export async function addOption(slug: string, personId: string, input: { what: string; where_name: string; starts_at: Date; cost: number | null }) {
  const b = await requireBundle(slug);
  if (!M.isMember(b, personId)) throw new DomainError("Join the plan to suggest an option.");
  if (b.plan.state !== "shaping" && b.plan.state !== "deciding") throw new DomainError("Options are closed for this plan.");
  if (!input.what.trim()) throw new DomainError("Say what the option is.");
  if (input.starts_at.getTime() <= Date.now()) throw new DomainError("Pick a time in the future.");
  if (b.options.length >= 6) throw new DomainError("Six options is the limit: too many and nobody decides.");
  await getStore().insert("plan_options", {
    id: newId(), plan_id: b.plan.id, what: input.what.trim().slice(0, 120), where_name: input.where_name.trim().slice(0, 120) || "To be decided",
    starts_at: input.starts_at.toISOString(), est_cost_per_person: input.cost, note: null, source: "person", created_by: personId, created_at: nowIso(),
  });
}

export async function removeOption(slug: string, personId: string, optionId: string) {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  if (b.plan.state !== "shaping") throw new DomainError("Options can only be removed before the poll goes out.");
  if (!b.options.some((o) => o.id === optionId)) throw new DomainError("That option isn't on this plan.");
  await getStore().remove("plan_options", optionId);
}

export async function sendPoll(slug: string, personId: string, deadline: Date) {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  const patch = guard(() => M.sendPoll(b, deadline, new Date()));
  await savePlan(b, patch);
  const store = getStore();
  for (const a of b.actions.filter((a) => a.kind === "poll" && a.status === "suggested")) {
    await store.update("companion_actions", a.id, { status: "done", summary: "Poll is open. Share the link in your group." });
  }
  await logAction(b.plan.id, "reminder", "authorised", "I'll lock the winning option at the deadline if enough people are in.");
  await say(b.plan, `Voting is open for "${b.plan.title}". Tap every option that works for you and say if you're in. Voting closes ${await whenText(patch.decision_deadline!)}.`);
}

/** Approval voting: tap every option that works for you. */
export async function toggleVote(slug: string, personId: string, optionId: string) {
  const b = await requireBundle(slug);
  if (b.plan.state !== "deciding" && b.plan.state !== "shaping") throw new DomainError("Voting has closed.");
  if (!b.options.some((o) => o.id === optionId)) throw new DomainError("That option isn't on this plan.");
  const store = getStore();
  const existing = b.votes.find((v) => v.option_id === optionId && v.person_id === personId);
  if (existing) await store.remove("votes", existing.id);
  else await store.insert("votes", { id: newId(), plan_id: b.plan.id, option_id: optionId, person_id: personId, created_at: nowIso() });
  await ensureCommitment(b, personId, "maybe");
}

async function ensureCommitment(b: PlanBundle, personId: string, fallback: Response) {
  if (!b.commitments.some((c) => c.person_id === personId)) {
    await getStore().insert("commitments", { id: newId(), plan_id: b.plan.id, person_id: personId, response: fallback, updated_at: nowIso() });
  }
}

export async function respond(slug: string, personId: string, response: Response) {
  const b = await requireBundle(slug);
  if (b.plan.state === "done" || b.plan.state === "dropped") throw new DomainError("This plan is closed.");
  if (b.plan.organiser_id === personId && response !== "in") {
    throw new DomainError("Organisers are always in. Drop the plan instead if it's off.");
  }
  const store = getStore();
  const existing = b.commitments.find((c) => c.person_id === personId);
  if (existing) await store.update("commitments", existing.id, { response, updated_at: nowIso() });
  else await store.insert("commitments", { id: newId(), plan_id: b.plan.id, person_id: personId, response, updated_at: nowIso() });
  // A nudge that got an answer is finished.
  for (const a of b.actions.filter((a) => a.kind === "nudge" && a.target_person_id === personId && a.status === "prepared")) {
    await store.update("companion_actions", a.id, { status: "done", summary: `${a.summary.split(" · ")[0]} · answered` });
  }
}

export async function lockPlan(slug: string, personId: string, optionId?: string) {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  const patch = guard(() => M.lock(b, optionId));
  const after = await savePlan(b, patch);
  const won = M.lockedOption(after);
  await logAction(b.plan.id, "lock", "done", `Locked: ${won?.what}. Everyone who's in gets a reminder.`);
  if (won) await say(b.plan, `It's on: ${won.what}, ${await whenText(won.starts_at)} at ${won.where_name}. Check in when you get there.`);
}

export async function dropPlan(slug: string, personId: string) {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  await savePlan(b, guard(() => M.drop(b)));
  await logAction(b.plan.id, "outcome", "done", "Plan dropped. No hard feelings: try another time.");
  await say(b.plan, `"${b.plan.title}" has been called off. Maybe another time.`);
}

/**
 * The companion prepares a message to each Maybe. It is never sent silently:
 * the organiser taps the WhatsApp link, so the action stays "prepared" until answered.
 */
export async function prepareNudges(slug: string, personId: string, planUrl: string) {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  const targets = M.nudgeTargets(b).filter((id) => id !== personId);
  if (targets.length === 0) throw new DomainError("Nobody to nudge right now.");
  const store = getStore();
  const people = await store.listIn("people", "id", targets);
  if (b.plan.chat_id) {
    // In a chat the organiser's tap is the authorisation: the companion asks the maybes there.
    const { formatRelative } = await import("./time");
    const names = people.map((p) => `@${p.name.split(" ")[0]}`).join(", ");
    const closes = b.plan.decision_deadline ? ` Voting closes ${formatRelative(b.plan.decision_deadline, new Date())}.` : "";
    await say(b.plan, `${names}, still keen on "${b.plan.title}"? Tap In or Out on the card so we can lock it.${closes}`);
    for (const p of people) await logAction(b.plan.id, "nudge", "done", `Asked ${p.name} in the chat`, { target_person_id: p.id });
    return;
  }
  const { nudgeMessage, whatsappLink } = await import("./companion");
  const { formatRelative } = await import("./time");
  const deadline = b.plan.decision_deadline ? formatRelative(b.plan.decision_deadline, new Date()) : "soon";
  for (const p of people) {
    const already = b.actions.some((a) => a.kind === "nudge" && a.target_person_id === p.id && a.status === "prepared");
    if (already) continue;
    await logAction(b.plan.id, "nudge", "prepared", `Nudge for ${p.name}`, {
      target_person_id: p.id, link: whatsappLink(nudgeMessage(p.name, b.plan.title, deadline, planUrl), p.phone),
    });
  }
}

export async function checkIn(slug: string, personId: string, again: boolean | null) {
  const b = await requireBundle(slug);
  if (!M.canCheckIn(b, personId, new Date())) {
    throw new DomainError("Check-in opens two hours before the plan starts, for people who are in.");
  }
  const store = getStore();
  await store.insert("checkins", { id: newId(), plan_id: b.plan.id, person_id: personId, again, created_at: nowIso() });
  const fresh = await loadBundle(b.plan);
  const patch = M.afterCheckin(fresh);
  if (patch) {
    await savePlan(fresh, patch);
    await logAction(b.plan.id, "outcome", "done", `It happened: ${fresh.checkins.length} people checked in.`);
    await say(b.plan, `"${b.plan.title}" happened 🎉 ${fresh.checkins.length} people checked in. Want to do it again? Tap Again on the card.`);
    await learnFromOutcome(fresh);
  }
}

export async function setAgain(slug: string, personId: string, again: boolean) {
  const b = await requireBundle(slug);
  const mine = b.checkins.find((c) => c.person_id === personId);
  if (!mine) throw new DomainError("Check in first.");
  await getStore().update("checkins", mine.id, { again });
}

/** Learned memory comes only from observed outcomes, and it always cites its evidence. */
async function learnFromOutcome(b: PlanBundle) {
  const store = getStore();
  const option = M.lockedOption(b);
  for (const c of b.checkins) {
    const text = `Enjoys ${CATEGORY_LABELS[b.plan.category].toLowerCase()} plans`;
    const existing = (await store.list("memories", { person_id: c.person_id, kind: "learned" })).find((m) => m.text === text);
    const evidence = `${b.plan.title}${option ? ` (${option.what})` : ""}`;
    if (existing) {
      await store.update("memories", existing.id, { evidence: `${evidence}; ${existing.evidence ?? ""}`.slice(0, 300) });
    } else {
      await store.insert("memories", { id: newId(), person_id: c.person_id, kind: "learned", text, evidence, created_at: nowIso() });
    }
  }
}

// ── Circles ──────────────────────────────────────────────────────────────────

export async function makeCircle(slug: string, personId: string, name: string): Promise<Circle> {
  const b = await requireBundle(slug);
  requireOrganiser(b, personId);
  if (b.plan.state !== "done") throw new DomainError("Make a Circle once the plan has happened.");
  if (b.plan.circle_id) throw new DomainError("This plan is already part of a Circle.");
  const store = getStore();
  const circle = await store.insert("circles", {
    id: newId(), name: name.trim().slice(0, 60) || b.plan.title, organiser_id: personId, category: b.plan.category, created_at: nowIso(),
  });
  const members = new Set([personId, ...b.commitments.filter((c) => c.response === "in").map((c) => c.person_id)]);
  for (const pid of members) {
    await store.insert("circle_members", { id: newId(), circle_id: circle.id, person_id: pid, created_at: nowIso() });
  }
  await store.update("plans", b.plan.id, { circle_id: circle.id, updated_at: nowIso() });
  await logAction(b.plan.id, "circle", "done", `Created the Circle "${circle.name}" with ${members.size} people.`);
  return circle;
}

export async function getCircle(circleId: string, personId: string) {
  const store = getStore();
  const circle = await store.get("circles", circleId);
  if (!circle) return null;
  const members = await store.list("circle_members", { circle_id: circleId });
  if (!members.some((m) => m.person_id === personId)) return null;
  const people = await store.listIn("people", "id", members.map((m) => m.person_id));
  const plans = (await store.list("plans", { circle_id: circleId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { circle, people, plans };
}

export async function listCircles(personId: string) {
  const store = getStore();
  const memberships = await store.list("circle_members", { person_id: personId });
  const circles = await store.listIn("circles", "id", memberships.map((m) => m.circle_id));
  return Promise.all(circles.map(async (c) => ({
    circle: c,
    memberCount: (await store.list("circle_members", { circle_id: c.id })).length,
    plans: (await store.list("plans", { circle_id: c.id })).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })));
}

export async function startNextInCircle(circleId: string, personId: string): Promise<Plan> {
  const data = await getCircle(circleId, personId);
  if (!data) throw new DomainError("Circle not found.");
  const last = data.plans[0];
  return createPlanFromSpark(personId, last ? last.spark : data.circle.name, circleId);
}

// ── Memory ───────────────────────────────────────────────────────────────────

export async function listMemories(personId: string): Promise<Memory[]> {
  return (await getStore().list("memories", { person_id: personId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addMemory(personId: string, text: string) {
  const t = text.trim().slice(0, 200);
  if (!t) throw new DomainError("Write something for the companion to remember.");
  await getStore().insert("memories", { id: newId(), person_id: personId, kind: "profile", text: t, evidence: "You told me", created_at: nowIso() });
}

export async function deleteMemory(personId: string, memoryId: string) {
  const m = await getStore().get("memories", memoryId);
  if (!m || m.person_id !== personId) throw new DomainError("Not found.");
  await getStore().remove("memories", memoryId);
}

// ── Now feed ─────────────────────────────────────────────────────────────────

export async function listBundlesForPerson(personId: string): Promise<PlanBundle[]> {
  const store = getStore();
  const [organised, commitments, memberships] = await Promise.all([
    store.list("plans", { organiser_id: personId }),
    store.list("commitments", { person_id: personId }),
    store.list("circle_members", { person_id: personId }),
  ]);
  const ids = new Set(organised.map((p) => p.id));
  const extra = await store.listIn("plans", "id", commitments.map((c) => c.plan_id).filter((id) => !ids.has(id)));
  const circlePlans = await store.listIn("plans", "circle_id", memberships.map((m) => m.circle_id));
  const all = new Map<string, Plan>();
  for (const p of [...organised, ...extra, ...circlePlans]) all.set(p.id, p);
  const bundles = await Promise.all([...all.values()].map((p) => getBundleBySlug(p.slug)));
  return bundles.filter((b): b is PlanBundle => !!b);
}

export interface NowCard {
  kind: "decide" | "organise" | "checkin" | "upcoming" | "reconnect" | "recent";
  slug?: string;
  title: string;
  detail: string;
  cta: string;
  href: string;
  at?: string;
}

export async function nowFeed(personId: string): Promise<{ needsYou: NowCard[]; inMotion: NowCard[]; sparks: NowCard[]; recent: NowCard[] }> {
  const now = new Date();
  const bundles = await listBundlesForPerson(personId);
  const needsYou: NowCard[] = [];
  const inMotion: NowCard[] = [];
  const recent: NowCard[] = [];
  const href = (b: PlanBundle) => `/p/${b.plan.slug}`;

  for (const b of bundles) {
    const isOrganiser = b.plan.organiser_id === personId;
    const mine = b.commitments.find((c) => c.person_id === personId);
    const option = M.lockedOption(b);
    if (b.plan.state === "shaping" && isOrganiser) {
      needsYou.push({ kind: "organise", slug: b.plan.slug, title: b.plan.title, detail: `${b.options.length} options ready. Send the poll to your group.`, cta: "Review and send", href: href(b) });
    } else if (b.plan.state === "shaping" && !isOrganiser) {
      // Circle members see a new plan in their Circle before the poll goes out.
      inMotion.push({ kind: "upcoming", slug: b.plan.slug, title: b.plan.title, detail: "The organiser is still shaping this plan.", cta: "Look", href: href(b) });
    } else if (b.plan.state === "deciding") {
      if (isOrganiser && M.deadlinePassedWithoutQuorum(b, now)) {
        needsYou.push({ kind: "organise", slug: b.plan.slug, title: b.plan.title, detail: `Deadline passed with ${M.inCount(b)} in. Nudge, extend or drop.`, cta: "Decide", href: href(b) });
      } else if (isOrganiser && M.nudgeTargets(b).length > 0) {
        needsYou.push({ kind: "organise", slug: b.plan.slug, title: b.plan.title, detail: `${M.nudgeTargets(b).length} maybe. I can draft nudges for you.`, cta: "Nudge maybes", href: href(b), at: b.plan.decision_deadline ?? undefined });
      } else if (!mine || mine.response === "maybe" || !b.votes.some((v) => v.person_id === personId)) {
        needsYou.push({ kind: "decide", slug: b.plan.slug, title: b.plan.title, detail: "Vote on the options and say if you're in.", cta: "Vote", href: href(b), at: b.plan.decision_deadline ?? undefined });
      } else {
        inMotion.push({ kind: "upcoming", slug: b.plan.slug, title: b.plan.title, detail: `Voting closes soon · ${M.inCount(b)} in`, cta: "Open", href: href(b), at: b.plan.decision_deadline ?? undefined });
      }
    } else if (b.plan.state === "locked" && option) {
      if (M.canCheckIn(b, personId, now)) {
        needsYou.push({ kind: "checkin", slug: b.plan.slug, title: b.plan.title, detail: `${option.what}: tap when you're there.`, cta: "Check in", href: href(b), at: option.starts_at });
      } else if (mine?.response === "in" || isOrganiser) {
        inMotion.push({ kind: "upcoming", slug: b.plan.slug, title: b.plan.title, detail: `${option.what} · ${option.where_name}`, cta: "Details", href: href(b), at: option.starts_at });
      }
    } else if (b.plan.state === "done") {
      recent.push({ kind: "recent", slug: b.plan.slug, title: b.plan.title, detail: `Happened · ${b.checkins.length} checked in`, cta: "See", href: href(b), at: b.plan.updated_at });
    }
  }
  inMotion.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  recent.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  // Reconnect sparks: people you've done things with, but not in the last 21 days.
  const sparks: NowCard[] = [];
  const lastTogether = new Map<string, number>();
  for (const b of bundles.filter((b) => b.plan.state === "done" && b.checkins.some((c) => c.person_id === personId))) {
    for (const c of b.checkins) {
      if (c.person_id === personId) continue;
      lastTogether.set(c.person_id, Math.max(lastTogether.get(c.person_id) ?? 0, Date.parse(b.plan.updated_at)));
    }
  }
  const active = new Set(bundles.filter((b) => ["shaping", "deciding", "locked"].includes(b.plan.state)).flatMap((b) => b.commitments.map((c) => c.person_id)));
  const stale = [...lastTogether.entries()].filter(([id, t]) => now.getTime() - t > 21 * 86400000 && !active.has(id));
  if (stale.length) {
    const people = await getStore().listIn("people", "id", stale.map(([id]) => id));
    for (const p of people.slice(0, 2)) {
      sparks.push({ kind: "reconnect", title: `Plan something with ${p.name.split(" ")[0]}?`, detail: "You haven't done anything together in a while.",
        cta: "Start a plan", href: `/start?spark=${encodeURIComponent(`Catch up with ${p.name.split(" ")[0]} this weekend`)}` });
    }
  }
  return { needsYou, inMotion, sparks, recent: recent.slice(0, 5) };
}

export async function peopleFor(b: PlanBundle): Promise<Map<string, Person>> {
  const ids = [...new Set([b.plan.organiser_id, ...b.commitments.map((c) => c.person_id)])];
  const people = await getStore().listIn("people", "id", ids);
  return new Map(people.map((p) => [p.id, p]));
}

/** Reliability bands for people in this plan, computed from their plan history. */
export async function reliabilityFor(personIds: string[]) {
  const store = getStore();
  const result = new Map<string, ReturnType<typeof M.reliability>>();
  for (const id of personIds) {
    const commitments = await store.list("commitments", { person_id: id, response: "in" });
    const plans = (await store.listIn("plans", "id", commitments.map((c) => c.plan_id))).filter((p) => p.state === "done");
    const bundles = await Promise.all(plans.map(loadBundle));
    result.set(id, M.reliability(id, bundles));
  }
  return result;
}

export type { PlanOption, Category };
