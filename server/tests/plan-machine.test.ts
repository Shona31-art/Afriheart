import { describe, expect, it } from "vitest";
import * as M from "@/lib/plan-machine";
import type { PlanBundle, Response } from "@/lib/types";

const NOW = new Date("2026-11-18T08:00:00Z"); // Wednesday 10:00 SAST

function bundle(over: Partial<PlanBundle["plan"]> = {}): PlanBundle {
  return {
    plan: {
      id: "p1", slug: "abc", organiser_id: "org", circle_id: null, chat_id: null, title: "Braai", spark: "braai", category: "celebrate",
      state: "shaping", min_people: 2, decision_deadline: null, locked_option_id: null, ai_source: "offline",
      ai_reasoning: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), ...over,
    },
    options: [
      { id: "o1", plan_id: "p1", what: "A", where_name: "X", starts_at: "2026-11-21T13:00:00Z", est_cost_per_person: 100, note: null, source: "companion", created_by: null, created_at: "" },
      { id: "o2", plan_id: "p1", what: "B", where_name: "Y", starts_at: "2026-11-22T12:00:00Z", est_cost_per_person: 50, note: null, source: "companion", created_by: null, created_at: "" },
    ],
    votes: [], commitments: [{ id: "c-org", plan_id: "p1", person_id: "org", response: "in", updated_at: "" }],
    checkins: [], actions: [],
  };
}

const commit = (b: PlanBundle, person: string, response: Response) =>
  b.commitments.push({ id: `c-${person}`, plan_id: "p1", person_id: person, response, updated_at: "" });
const vote = (b: PlanBundle, person: string, option: string) =>
  b.votes.push({ id: `v-${person}-${option}`, plan_id: "p1", option_id: option, person_id: person, created_at: "" });

describe("sendPoll", () => {
  it("opens voting with a future deadline before the earliest option", () => {
    const patch = M.sendPoll(bundle(), new Date("2026-11-20T10:00:00Z"), NOW);
    expect(patch.state).toBe("deciding");
  });
  it("rejects a deadline in the past or after the plan starts", () => {
    expect(() => M.sendPoll(bundle(), new Date("2026-11-17T10:00:00Z"), NOW)).toThrow(M.TransitionError);
    expect(() => M.sendPoll(bundle(), new Date("2026-11-22T10:00:00Z"), NOW)).toThrow(/before the earliest/);
  });
  it("rejects a second poll", () => {
    expect(() => M.sendPoll(bundle({ state: "deciding" }), new Date("2026-11-20T10:00:00Z"), NOW)).toThrow();
  });
});

describe("voting and locking", () => {
  it("picks the option with most approvals, earliest on ties", () => {
    const b = bundle({ state: "deciding" });
    vote(b, "a", "o2"); vote(b, "b", "o2"); vote(b, "c", "o1");
    expect(M.winner(b)?.id).toBe("o2");
    const tie = bundle({ state: "deciding" });
    vote(tie, "a", "o1"); vote(tie, "b", "o2");
    expect(M.winner(tie)?.id).toBe("o1");
  });
  it("needs a quorum of people in to lock", () => {
    const b = bundle({ state: "deciding" });
    expect(() => M.lock(b)).toThrow(/Needs 2 people/);
    commit(b, "a", "in");
    expect(M.lock(b)).toEqual({ state: "locked", locked_option_id: "o1" });
  });
  it("auto-locks at the deadline only with a quorum", () => {
    const b = bundle({ state: "deciding", decision_deadline: "2026-11-18T07:00:00Z" });
    expect(M.autoAdvance(b, NOW)).toBeNull();
    expect(M.deadlinePassedWithoutQuorum(b, NOW)).toBe(true);
    commit(b, "a", "in"); vote(b, "a", "o2");
    expect(M.autoAdvance(b, NOW)).toEqual({ state: "locked", locked_option_id: "o2" });
  });
  it("does nothing before the deadline", () => {
    const b = bundle({ state: "deciding", decision_deadline: "2026-11-19T07:00:00Z" });
    commit(b, "a", "in");
    expect(M.autoAdvance(b, NOW)).toBeNull();
  });
});

describe("nudges", () => {
  it("targets maybes while voting is open", () => {
    const b = bundle({ state: "deciding" });
    commit(b, "a", "maybe"); commit(b, "b", "out"); commit(b, "c", "in");
    expect(M.nudgeTargets(b)).toEqual(["a"]);
    expect(M.nudgeTargets({ ...b, plan: { ...b.plan, state: "locked" } })).toEqual([]);
  });
});

describe("check-in and outcome", () => {
  const locked = () => {
    const b = bundle({ state: "locked", locked_option_id: "o1" });
    commit(b, "a", "in");
    return b;
  };
  it("opens two hours before the start, only for people who are in", () => {
    const b = locked();
    expect(M.canCheckIn(b, "a", new Date("2026-11-21T10:30:00Z"))).toBe(false);
    expect(M.canCheckIn(b, "a", new Date("2026-11-21T11:30:00Z"))).toBe(true);
    expect(M.canCheckIn(b, "stranger", new Date("2026-11-21T11:30:00Z"))).toBe(false);
  });
  it("is done after two check-ins", () => {
    const b = locked();
    b.checkins.push({ id: "k1", plan_id: "p1", person_id: "org", again: null, created_at: "" });
    expect(M.afterCheckin(b)).toBeNull();
    b.checkins.push({ id: "k2", plan_id: "p1", person_id: "a", again: true, created_at: "" });
    expect(M.afterCheckin(b)).toEqual({ state: "done" });
    expect(M.againVotes(b)).toBe(1);
  });
  it("can't drop a finished plan", () => {
    expect(() => M.drop(bundle({ state: "done" }))).toThrow();
  });
});

describe("reliability", () => {
  it("is 'New here' under three completed plans and banded after", () => {
    const done = (id: string, showed: boolean): PlanBundle => {
      const b = bundle({ id, state: "done" });
      commit(b, "a", "in");
      if (showed) b.checkins.push({ id: `k-${id}`, plan_id: id, person_id: "a", again: null, created_at: "" });
      return b;
    };
    expect(M.reliability("a", [done("1", true), done("2", true)]).band).toBe("New here");
    expect(M.reliability("a", [done("1", true), done("2", true), done("3", true)]).band).toBe("Usually shows up");
    expect(M.reliability("a", [done("1", true), done("2", true), done("3", false)]).band).toBe("Often shows up");
    expect(M.reliability("a", [done("1", false), done("2", true), done("3", false)]).band).toBe("Sometimes shows up");
  });
});
