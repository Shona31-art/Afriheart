import { describe, expect, it } from "vitest";
import { ageOn, compatible, rank } from "@/lib/matching";
import type { DatingProfile } from "@/lib/types";

const NOW = new Date("2026-11-18T10:00:00Z");
const p = (over: Partial<DatingProfile>): DatingProfile => ({
  id: "x", person_id: "x", display_name: "X", birthdate: "1998-05-01", gender: "woman", interested_in: ["men"], age_min: 18, age_max: 99,
  area: "Morningside", bio: "", photos: ["profiles/aaaaaaaaaaaaaaaaaaaaaaaa.jpg"], date_idea: "Sunrise walk", date_idea_category: "outdoors",
  paused: false, consent_at: "", created_at: "", updated_at: "2026-11-01T00:00:00Z", ...over,
});

describe("matching rules", () => {
  it("computes age on a date", () => {
    expect(ageOn("2008-11-18", NOW)).toBe(18);
    expect(ageOn("2008-11-19", NOW)).toBe(17);
  });

  it("needs both people to want each other", () => {
    const her = p({ person_id: "her", gender: "woman", interested_in: ["men"] });
    const him = p({ person_id: "him", gender: "man", interested_in: ["women"] });
    expect(compatible(her, him, NOW)).toBe(true);
    expect(compatible(him, her, NOW)).toBe(true);
    const himForMen = p({ person_id: "him2", gender: "man", interested_in: ["men"] });
    expect(compatible(her, himForMen, NOW)).toBe(false);
    const nb = p({ person_id: "nb", gender: "nonbinary", interested_in: ["women", "nonbinary"] });
    const herOpen = p({ person_id: "her2", gender: "woman", interested_in: ["men", "women", "nonbinary"] });
    expect(compatible(nb, herOpen, NOW)).toBe(true);
    expect(compatible(her, nb, NOW)).toBe(false);
  });

  it("respects both age ranges and the 18+ rule", () => {
    const her = p({ person_id: "her", age_min: 25, age_max: 35 }); // 28
    const young = p({ person_id: "y", gender: "man", interested_in: ["women"], birthdate: "2004-01-01" }); // 22
    expect(compatible(her, young, NOW)).toBe(false);
    const minor = p({ person_id: "m", gender: "man", interested_in: ["women"], birthdate: "2009-06-01" });
    expect(compatible(p({ person_id: "a" }), minor, NOW)).toBe(false);
    const picky = p({ person_id: "pk", gender: "man", interested_in: ["women"], age_min: 30, age_max: 40 });
    expect(compatible(her, picky, NOW)).toBe(false); // she's 28, outside his range
  });

  it("hides paused profiles and profiles without photos", () => {
    const her = p({ person_id: "her" });
    expect(compatible(her, p({ person_id: "a", gender: "man", interested_in: ["women"], paused: true }), NOW)).toBe(false);
    expect(compatible(her, p({ person_id: "b", gender: "man", interested_in: ["women"], photos: [] }), NOW)).toBe(false);
    expect(compatible(her, her, NOW)).toBe(false);
  });

  it("ranks people who liked you and share your kind of date first", () => {
    const me = p({ person_id: "me", gender: "man", interested_in: ["women"] });
    const a = p({ person_id: "a", date_idea_category: "food" });
    const b = p({ person_id: "b", date_idea_category: "outdoors" });
    expect(rank(me, b, false)).toBeGreaterThan(rank(me, a, false));
    expect(rank(me, a, true)).toBeGreaterThan(rank(me, b, false));
  });
});
