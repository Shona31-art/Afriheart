// Offline companion: deterministic proposals from the city guide.
// Used when no AI key is configured, and as the fallback whenever the model fails,
// so the loop never breaks because an API is down.

import { GUIDE_ITEMS, SLOT_HOURS } from "../guide";
import { nextWeekdayAt, weekdayIndex, localParts, atLocal } from "../time";
import type { Category, GuideItem } from "../types";
import type { ProposalInput, Proposal, CompanionModel } from "./types";

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  food: ["dinner", "lunch", "brunch", "eat", "food", "restaurant", "bunny", "drinks", "coffee", "sushi", "curry", "breakfast"],
  outdoors: ["hike", "walk", "beach", "trail", "picnic", "gorge", "swim", "surf", "sunrise", "garden", "promenade", "nature"],
  sport: ["run", "football", "soccer", "5-a-side", "five a side", "padel", "gym", "tennis", "cycle", "parkrun", "volleyball", "squash", "game"],
  events: ["market", "gig", "concert", "comedy", "show", "festival", "movie", "cinema", "club", "jazz", "music", "aquarium"],
  celebrate: ["birthday", "braai", "celebrate", "farewell", "graduation", "anniversary", "party", "bday"],
};

export function detectCategory(spark: string): Category {
  const s = spark.toLowerCase();
  let best: Category = "other";
  let bestHits = 0;
  for (const [cat, words] of Object.entries(KEYWORDS) as [Category, string[]][]) {
    const hits = words.filter((w) => s.includes(w)).length;
    if (hits > bestHits) {
      best = cat;
      bestHits = hits;
    }
  }
  return best;
}

/** Slots the spark asks for explicitly ("saturday", "this weekend", "sunday morning"). */
export function requestedSlots(spark: string): string[] {
  const s = spark.toLowerCase();
  const slots: string[] = [];
  const morning = /\bmorning|sunrise|early\b/.test(s);
  const evening = /\bevening|night|tonight|dinner\b/.test(s);
  const words = s.split(/[^a-z]+/);
  for (const w of words) {
    const d = weekdayIndex(w);
    if (d === 5) slots.push("fri-pm");
    if (d === 6) slots.push(...(evening ? ["sat-pm"] : morning ? ["sat-am"] : ["sat-am", "sat-pm"]));
    if (d === 0) slots.push(...(evening ? ["sun-pm"] : morning ? ["sun-am"] : ["sun-am", "sun-pm"]));
    if (d >= 1 && d <= 4) slots.push("weeknight");
  }
  if (/\bweekend\b/.test(s)) {
    // Spread across both days, at times that suit what was asked.
    slots.push(...(morning ? ["sat-am", "sun-am"] : evening ? ["fri-pm", "sat-pm"] : ["sat-am", "sun-pm", "sat-pm"]));
  }
  return [...new Set(slots)];
}

function budgetFit(item: GuideItem, budget: ProposalInput["budget"]): number {
  if (item.est_cost == null || !budget) return 0;
  const cap = budget === "low" ? 120 : budget === "mid" ? 250 : 10000;
  return item.est_cost <= cap ? 1 : -1;
}

function slotStart(slot: string, now: Date, spark: string): Date {
  const s = spark.toLowerCase();
  const p = localParts(now);
  if (/\btomorrow\b/.test(s)) {
    const hour = SLOT_HOURS[slot]?.hour ?? 18;
    return atLocal(p.year, p.month, p.day + 1, hour);
  }
  const def = SLOT_HOURS[slot] ?? SLOT_HOURS["sat-pm"];
  return nextWeekdayAt(now, def.weekday, def.hour);
}

function suggestDeadline(earliestStart: Date, now: Date): Date {
  const lead = earliestStart.getTime() - now.getTime();
  const dayBefore = earliestStart.getTime() - 24 * 3600000;
  const at = lead > 30 * 3600000 ? dayBefore : now.getTime() + lead / 2;
  return new Date(Math.max(at, now.getTime() + 60 * 60000));
}

export function proposeOffline(input: ProposalInput): Proposal {
  const { spark, now } = input;
  const category = detectCategory(spark);
  const s = spark.toLowerCase();
  const pool = (category === "other" ? GUIDE_ITEMS : GUIDE_ITEMS.filter((g) => g.category === category))
    .map((item) => ({
      item,
      score:
        (item.name.toLowerCase().split(/\W+/).some((w) => w.length > 3 && s.includes(w)) ? 5 : 0) +
        budgetFit(item, input.budget) +
        item.best_slots.filter((sl) => input.availability.includes(sl)).length,
    }))
    .sort((a, b) => b.score - a.score);

  const asked = requestedSlots(spark);
  const options: Proposal["options"] = [];
  const used = new Set<string>();
  for (const { item } of pool) {
    // Rotate through the wanted times so the group gets a real choice of day, not three options at once.
    const wanted = asked.length ? asked : [...new Set([...item.best_slots.filter((sl) => input.availability.includes(sl)), ...item.best_slots])];
    const rotated = [...wanted.slice(options.length % wanted.length), ...wanted.slice(0, options.length % wanted.length)];
    const usedTimes = new Set(options.map((o) => o.starts_at));
    const fits = (sl: string) => !asked.length || item.best_slots.includes(sl);
    const suitable = rotated.filter(fits); // never suggest brunch at 7 pm because Friday evening was asked for
    if (suitable.length === 0) continue;
    const slots = [...suitable.filter((sl) => !usedTimes.has(slotStart(sl, now, spark).toISOString())), ...suitable];
    for (const slot of slots) {
      const key = `${item.id}:${slot}`;
      if (used.has(key) || options.some((o) => o.guide_item_id === item.id)) continue;
      used.add(key);
      options.push({
        what: item.name,
        where_name: item.area,
        starts_at: slotStart(slot, now, spark).toISOString(),
        est_cost_per_person: item.est_cost,
        note: item.description,
        guide_item_id: item.id,
      });
      break;
    }
    if (options.length === 3) break;
  }

  if (options.length === 0) {
    const start = nextWeekdayAt(now, 6, 15);
    options.push({ what: spark.trim() || "Get together", where_name: input.homeArea || "To be decided",
      starts_at: start.toISOString(), est_cost_per_person: null, note: null, guide_item_id: null });
  }
  options.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const earliest = new Date(options[0].starts_at);
  const title = spark.trim().replace(/\s+/g, " ");
  const slotLabels = [...new Set(options.map((o) => o.starts_at))].length;
  return {
    title: (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 80),
    category,
    options,
    deadline: suggestDeadline(earliest, now).toISOString(),
    reasoning:
      `${options.length} ${category === "other" ? "" : category + " "}ideas across ${slotLabels} time slot${slotLabels === 1 ? "" : "s"}` +
      (asked.length ? ", matching the days you mentioned" : input.availability.length ? ", matching your usual availability" : "") +
      (input.budget ? `, within a ${input.budget} budget where possible` : "") +
      ". The vote closes a day before the earliest option so people have time to commit.",
    source: "offline",
  };
}

export const offlineModel: CompanionModel = {
  name: "offline",
  async propose(input) {
    return proposeOffline(input);
  },
};
