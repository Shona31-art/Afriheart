import { describe, expect, it } from "vitest";
import { QUESTIONS, cleanAnswer, compatibility, type Answers } from "@/lib/compatibility";

const all = (q: string) => QUESTIONS.find((x) => x.id === q)!.options.map((o) => o.id);
const ans = (pairs: [string, string, string[] | null, 0 | 1 | 2 | 3][]): Answers =>
  Object.fromEntries(pairs.map(([q, a, ok, imp]) => [q, { a, ok: ok ?? all(q), imp }]));

describe("compatibility", () => {
  it("needs enough shared answers before showing a score", () => {
    const a = ans([["smoke", "never", null, 2], ["drink", "social", null, 2]]);
    const r = compatibility(a, a);
    expect(r.score).toBeNull();
    expect(r.common).toBe(2);
  });

  it("is 100% when both accept each other on everything they care about", () => {
    const a = ans([["smoke", "never", ["never"], 3], ["drink", "social", null, 2], ["kids", "want", ["want", "unsure"], 3], ["pets", "dogs", null, 1], ["texting", "few", null, 2]]);
    const b = ans([["smoke", "never", null, 2], ["drink", "never", null, 1], ["kids", "unsure", null, 2], ["pets", "cats", null, 0], ["texting", "few", null, 2]]);
    const r = compatibility(a, b);
    expect(r.score).toBe(100);
    expect(r.shared).toContain("don't smoke");
    expect(r.shared).toContain("text a few times a day");
    expect(r.differ).toEqual([]);
  });

  it("drops sharply on something marked very important, and is the same both ways", () => {
    const a = ans([["smoke", "never", ["never"], 3], ["drink", "social", null, 2], ["kids", "want", ["want"], 3], ["pets", "dogs", null, 1], ["texting", "few", null, 2]]);
    const b = ans([["smoke", "often", null, 0], ["drink", "social", null, 2], ["kids", "dont", ["dont"], 3], ["pets", "dogs", null, 1], ["texting", "few", null, 2]]);
    const ab = compatibility(a, b);
    const ba = compatibility(b, a);
    expect(ab.score).toBe(ba.score);
    expect(ab.score!).toBeLessThan(30);
    expect(ab.differ).toEqual(expect.arrayContaining(["smoking", "kids"]));
  });

  it("weighs what each person cares about", () => {
    const base: [string, string, string[] | null, 0 | 1 | 2 | 3][] = [["drink", "social", null, 2], ["pets", "dogs", null, 2], ["texting", "few", null, 2], ["weekend", "mix", null, 2]];
    const meCaresALittle = ans([...base, ["smoke", "never", ["never"], 1]]);
    const meCaresALot = ans([...base, ["smoke", "never", ["never"], 3]]);
    const smoker = ans([...base, ["smoke", "often", null, 2]]);
    expect(compatibility(meCaresALot, smoker).score!).toBeLessThan(compatibility(meCaresALittle, smoker).score!);
  });

  it("cleans answers from the client", () => {
    expect(cleanAnswer("smoke", { a: "never", ok: ["never", "bogus"], imp: 3 })).toEqual({ a: "never", ok: ["never"], imp: 3 });
    expect(cleanAnswer("smoke", { a: "nope" })).toBeNull();
    expect(cleanAnswer("religion", { a: "x" })).toBeNull();
    expect(cleanAnswer("smoke", { a: "never", ok: [] })?.ok).toEqual(all("smoke")); // empty = anything is fine
  });

  it("has a deep pack whose answers count like any other", () => {
    const deep = QUESTIONS.filter((q) => q.pack === "deep");
    expect(deep.length).toBeGreaterThanOrEqual(12);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length); // ids unique across packs
    for (const q of QUESTIONS) expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length);
    const a = ans([["cheating", "emotional", ["emotional", "flirting"], 3], ["phone", "ask", null, 2], ["sharemoney", "bills", null, 2], ["exes", "depends", null, 1], ["marriage", "yes", ["yes", "open"], 3]]);
    const b = ans([["cheating", "physical", null, 2], ["phone", "ask", null, 2], ["sharemoney", "bills", null, 2], ["exes", "depends", null, 1], ["marriage", "open", null, 2]]);
    const r = compatibility(a, b);
    expect(r.score!).toBeLessThan(80);
    expect(r.differ).toContain("what counts as cheating");
    expect(r.shared).toContain("would ask before looking");
  });

  it("leaves out special personal information", () => {
    const text = QUESTIONS.map((q) => q.text + q.options.map((o) => o.label).join(" ")).join(" ").toLowerCase();
    for (const w of ["religio", "church", "pray", "politic", "vote", "health", "sex", "race", "ethnic"]) expect(text).not.toContain(w);
  });
});
