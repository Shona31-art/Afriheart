import "server-only";
import { z } from "zod";
import { GUIDE_ITEMS } from "../guide";
import { CITY_TZ } from "../time";
import type { CompanionModel, Proposal, ProposalInput } from "./types";

const ProposalSchema = z.object({
  title: z.string().min(1).max(80),
  category: z.enum(["food", "outdoors", "sport", "events", "celebrate", "other"]),
  reasoning: z.string().max(400),
  deadline: z.string(),
  options: z
    .array(
      z.object({
        what: z.string().min(1).max(120),
        where_name: z.string().min(1).max(120),
        starts_at: z.string(),
        est_cost_per_person: z.number().nullable(),
        note: z.string().max(240).nullable(),
        guide_item_id: z.string().nullable(),
      }),
    )
    .min(1)
    .max(3),
});

function prompt(input: ProposalInput): string {
  return [
    "You are the companion inside Afriheart, an app that turns a group's vague intention into a plan that actually happens.",
    "Shape the organiser's spark into 2-3 concrete, realistic options a group can vote on.",
    `Current time (ISO, UTC): ${input.now.toISOString()}. City time zone: ${CITY_TZ}. City: Durban, South Africa.`,
    `Organiser home area: ${input.homeArea ?? "unknown"}. Budget: ${input.budget ?? "unknown"}. Usual availability slots: ${input.availability.join(", ") || "unknown"}.`,
    `Things the organiser asked the companion to remember: ${input.memories.join("; ") || "none"}.`,
    "Prefer items from this curated city guide (use their id as guide_item_id); you may suggest something else if the spark clearly needs it, with guide_item_id null:",
    JSON.stringify(GUIDE_ITEMS.map(({ id, name, category, area, best_slots, est_cost }) => ({ id, name, category, area, best_slots, est_cost }))),
    "Rules: every starts_at must be a future ISO-8601 UTC timestamp within 30 days, at a sensible local hour.",
    "deadline is when voting closes: before the earliest option, normally ~24h before, never in the past.",
    "est_cost_per_person is in ZAR, approximate, or null. Do not invent facts like opening hours or prices you don't know: say 'check before going' in note instead.",
    "reasoning: one or two plain sentences explaining why these options fit.",
    `Spark: """${input.spark.slice(0, 500)}"""`,
    "Respond with JSON only: {title, category, reasoning, deadline, options:[{what, where_name, starts_at, est_cost_per_person, note, guide_item_id}]}",
  ].join("\n");
}

export function validateProposal(raw: unknown, now: Date): Proposal {
  const p = ProposalSchema.parse(raw);
  const max = now.getTime() + 31 * 86400000;
  const options = p.options.filter((o) => {
    const t = Date.parse(o.starts_at);
    return Number.isFinite(t) && t > now.getTime() && t < max;
  });
  if (options.length === 0) throw new Error("model returned no usable future options");
  options.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const earliest = Date.parse(options[0].starts_at);
  let deadline = Date.parse(p.deadline);
  if (!Number.isFinite(deadline) || deadline <= now.getTime() || deadline >= earliest) {
    deadline = Math.max(now.getTime() + 3600000, Math.min(earliest - 24 * 3600000, now.getTime() + (earliest - now.getTime()) / 2));
  }
  return {
    ...p,
    options: options.map((o) => ({ ...o, starts_at: new Date(o.starts_at).toISOString() })),
    deadline: new Date(deadline).toISOString(),
    source: "gemini",
  };
}

export function geminiModel(apiKey: string, model = process.env.GEMINI_MODEL || "gemini-2.5-flash"): CompanionModel {
  return {
    name: `gemini:${model}`,
    async propose(input) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt(input) }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return validateProposal(JSON.parse(text), input.now);
    },
  };
}
