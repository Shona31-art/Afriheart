import { describe, expect, it } from "vitest";
import { detectCategory, proposeOffline, requestedSlots } from "@/lib/companion/offline";
import { validateProposal } from "@/lib/companion/gemini";
import { localParts, atLocal, fromLocalInput, toLocalInput } from "@/lib/time";
import { normalizePhone } from "@/lib/domain";

const NOW = new Date("2026-11-18T08:00:00Z"); // Wednesday 10:00 SAST
const base = { now: NOW, homeArea: null, budget: null, availability: [] as string[], memories: [] as string[] };

describe("offline companion", () => {
  it("detects categories from plain language", () => {
    expect(detectCategory("Braai at mine this month")).toBe("celebrate");
    expect(detectCategory("trail run at Giba Gorge")).toBe("outdoors");
    expect(detectCategory("5-a-side on Saturday")).toBe("sport");
    expect(detectCategory("dinner on Florida Road")).toBe("food");
    expect(detectCategory("hang out")).toBe("other");
  });

  it("reads the days people ask for", () => {
    expect(requestedSlots("sunday morning walk")).toEqual(["sun-am"]);
    expect(requestedSlots("this weekend")).toEqual(["sat-am", "sun-pm", "sat-pm"]);
    expect(requestedSlots("sunrise walk this weekend")).toEqual(["sat-am", "sun-am"]);
  });

  it("proposes up to three future options and a deadline before the first", () => {
    const p = proposeOffline({ ...base, spark: "Dinner on Florida Road this Friday" });
    expect(p.category).toBe("food");
    expect(p.options.length).toBeGreaterThan(0);
    expect(p.options.length).toBeLessThanOrEqual(3);
    expect(p.options[0].what).toMatch(/Florida Road/);
    for (const o of p.options) expect(Date.parse(o.starts_at)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(p.deadline)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(p.deadline)).toBeLessThan(Date.parse(p.options[0].starts_at));
    // Friday 19:00 SAST
    const local = localParts(new Date(p.options[0].starts_at));
    expect(local.weekday).toBe(5);
    expect(local.hour).toBe(19);
  });

  it("spreads weekend options across different days and times", () => {
    const p = proposeOffline({ ...base, spark: "sunrise walk on the promenade this weekend" });
    const days = new Set(p.options.map((o) => localParts(new Date(o.starts_at)).weekday));
    expect(new Set(p.options.map((o) => o.starts_at)).size).toBeGreaterThanOrEqual(2);
    expect(days.size).toBeGreaterThan(1);
  });

  it("falls back to a generic option for anything", () => {
    const p = proposeOffline({ ...base, spark: "zzz" });
    expect(p.options.length).toBeGreaterThan(0);
  });
});

describe("model output validation", () => {
  it("drops past options and repairs a bad deadline", () => {
    const p = validateProposal({
      title: "Run", category: "sport", reasoning: "x", deadline: "2020-01-01T00:00:00Z",
      options: [
        { what: "Old", where_name: "X", starts_at: "2020-01-01T00:00:00Z", est_cost_per_person: null, note: null, guide_item_id: null },
        { what: "Parkrun", where_name: "North Beach", starts_at: "2026-11-21T05:00:00Z", est_cost_per_person: 0, note: null, guide_item_id: "g-parkrun" },
      ],
    }, NOW);
    expect(p.options.map((o) => o.what)).toEqual(["Parkrun"]);
    expect(Date.parse(p.deadline)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(p.deadline)).toBeLessThan(Date.parse("2026-11-21T05:00:00Z"));
  });
  it("rejects malformed output", () => {
    expect(() => validateProposal({ title: "x" }, NOW)).toThrow();
  });
});

describe("time and phone helpers", () => {
  it("converts SAST wall clock both ways", () => {
    const d = atLocal(2026, 10, 21, 7);
    expect(d.toISOString()).toBe("2026-11-21T05:00:00.000Z");
    expect(toLocalInput(d.toISOString())).toBe("2026-11-21T07:00");
    expect(fromLocalInput("2026-11-21T07:00")?.toISOString()).toBe(d.toISOString());
  });
  it("normalises South African numbers", () => {
    expect(normalizePhone("082 123 4567")).toBe("27821234567");
    expect(normalizePhone("+27 82 123 4567")).toBe("27821234567");
    expect(normalizePhone("123")).toBeNull();
  });
});
