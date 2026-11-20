// The Follow-Through Loop as a deterministic state machine.
// The AI may *propose* transitions; only these functions decide them.
//
//   shaping ──sendPoll──▶ deciding ──lock──▶ locked ──checkins≥2──▶ done
//      │                     │                  │
//      └───────drop──────────┴──────drop────────┘──▶ dropped

import type { PlanBundle, PlanOption, Plan, Response, Commitment } from "./types";

export class TransitionError extends Error {}

export const CHECKIN_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000; // check-in opens 2h before start
export const DONE_CHECKINS = 2; // two people confirming = it happened

export function respondents(b: PlanBundle, response: Response): Commitment[] {
  return b.commitments.filter((c) => c.response === response);
}

export function inCount(b: PlanBundle): number {
  return respondents(b, "in").length;
}

export function hasQuorum(b: PlanBundle): boolean {
  return inCount(b) >= b.plan.min_people;
}

export function tally(b: PlanBundle): { option: PlanOption; votes: number }[] {
  return b.options
    .map((option) => ({ option, votes: b.votes.filter((v) => v.option_id === option.id).length }))
    .sort((a, c) => c.votes - a.votes || a.option.starts_at.localeCompare(c.option.starts_at));
}

/** Winning option: most votes, ties broken by the earliest start. */
export function winner(b: PlanBundle): PlanOption | null {
  const t = tally(b);
  return t.length ? t[0].option : null;
}

export function lockedOption(b: PlanBundle): PlanOption | null {
  return b.options.find((o) => o.id === b.plan.locked_option_id) ?? null;
}

export function sendPoll(b: PlanBundle, deadline: Date, now: Date): Partial<Plan> {
  if (b.plan.state !== "shaping") throw new TransitionError("The poll has already gone out.");
  if (b.options.length === 0) throw new TransitionError("Add at least one option first.");
  if (deadline.getTime() <= now.getTime()) throw new TransitionError("The decision deadline must be in the future.");
  const earliest = Math.min(...b.options.map((o) => Date.parse(o.starts_at)));
  if (deadline.getTime() > earliest) throw new TransitionError("The deadline must be before the earliest option starts.");
  return { state: "deciding", decision_deadline: deadline.toISOString() };
}

export function lock(b: PlanBundle, optionId?: string): Partial<Plan> {
  if (b.plan.state !== "deciding" && b.plan.state !== "shaping") {
    throw new TransitionError("Only an open plan can be locked.");
  }
  const option = optionId ? b.options.find((o) => o.id === optionId) : winner(b);
  if (!option) throw new TransitionError("There is no option to lock.");
  if (!hasQuorum(b)) {
    throw new TransitionError(
      `Needs ${b.plan.min_people} people in to lock (currently ${inCount(b)}). Nudge the maybes or drop the plan.`,
    );
  }
  return { state: "locked", locked_option_id: option.id };
}

export function drop(b: PlanBundle): Partial<Plan> {
  if (b.plan.state === "done" || b.plan.state === "dropped") throw new TransitionError("This plan is already closed.");
  return { state: "dropped" };
}

/** Time-driven transition: at the deadline, lock automatically if there is a quorum. */
export function autoAdvance(b: PlanBundle, now: Date): Partial<Plan> | null {
  if (b.plan.state !== "deciding" || !b.plan.decision_deadline) return null;
  if (Date.parse(b.plan.decision_deadline) > now.getTime()) return null;
  if (!hasQuorum(b)) return null; // organiser decides: nudge, extend or drop
  return lock(b);
}

export function deadlinePassedWithoutQuorum(b: PlanBundle, now: Date): boolean {
  return (
    b.plan.state === "deciding" &&
    !!b.plan.decision_deadline &&
    Date.parse(b.plan.decision_deadline) <= now.getTime() &&
    !hasQuorum(b)
  );
}

export function canCheckIn(b: PlanBundle, personId: string, now: Date): boolean {
  if (b.plan.state !== "locked") return false;
  const option = lockedOption(b);
  if (!option) return false;
  const isIn = b.commitments.some((c) => c.person_id === personId && c.response === "in");
  const already = b.checkins.some((c) => c.person_id === personId);
  return isIn && !already && now.getTime() >= Date.parse(option.starts_at) - CHECKIN_WINDOW_BEFORE_MS;
}

/** After a check-in: two confirmations (or everyone who was in, if fewer) completes the plan. */
export function afterCheckin(b: PlanBundle): Partial<Plan> | null {
  if (b.plan.state !== "locked") return null;
  const needed = Math.min(DONE_CHECKINS, Math.max(1, inCount(b)));
  return b.checkins.length >= needed ? { state: "done" } : null;
}

/** People the companion should chase: Maybes, while the plan is still open. */
export function nudgeTargets(b: PlanBundle): string[] {
  if (b.plan.state !== "deciding") return [];
  return respondents(b, "maybe").map((c) => c.person_id);
}

export function isMember(b: PlanBundle, personId: string): boolean {
  return b.plan.organiser_id === personId || b.commitments.some((c) => c.person_id === personId);
}

export type ReliabilityBand = "New here" | "Usually shows up" | "Often shows up" | "Sometimes shows up";

/**
 * Reliability = of the completed plans a person said In to, how many they checked in to.
 * Shown only as a band, never a score, and only to people sharing a plan.
 */
export function reliability(personId: string, bundles: PlanBundle[]): { band: ReliabilityBand; samples: number } {
  const relevant = bundles.filter(
    (b) => b.plan.state === "done" && b.commitments.some((c) => c.person_id === personId && c.response === "in"),
  );
  const samples = relevant.length;
  if (samples < 3) return { band: "New here", samples };
  const showed = relevant.filter((b) => b.checkins.some((c) => c.person_id === personId)).length;
  const rate = showed / samples;
  if (rate >= 0.85) return { band: "Usually shows up", samples };
  if (rate >= 0.6) return { band: "Often shows up", samples };
  return { band: "Sometimes shows up", samples };
}

export function againVotes(b: PlanBundle): number {
  return b.checkins.filter((c) => c.again).length;
}
