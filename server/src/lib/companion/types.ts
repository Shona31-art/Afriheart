import type { Category } from "../types";

export interface ProposalInput {
  spark: string;
  now: Date;
  homeArea: string | null;
  budget: "low" | "mid" | "high" | null;
  availability: string[];
  memories: string[];
}

export interface ProposedOption {
  what: string;
  where_name: string;
  starts_at: string; // ISO, UTC
  est_cost_per_person: number | null;
  note: string | null;
  guide_item_id: string | null;
}

export interface Proposal {
  title: string;
  category: Category;
  options: ProposedOption[];
  deadline: string; // ISO
  reasoning: string;
  source: "gemini" | "offline";
}

/** Provider abstraction: swap models without touching the loop. */
export interface CompanionModel {
  name: string;
  propose(input: ProposalInput): Promise<Proposal>;
}
