import "server-only";
import { geminiModel } from "./gemini";
import { offlineModel, proposeOffline } from "./offline";
import type { Proposal, ProposalInput } from "./types";

export type { Proposal, ProposalInput } from "./types";

/** Propose options with the configured model, falling back to the offline companion on any failure. */
export async function propose(input: ProposalInput): Promise<Proposal> {
  const key = process.env.GEMINI_API_KEY;
  const model = key ? geminiModel(key) : offlineModel;
  try {
    return await model.propose(input);
  } catch (err) {
    console.warn(`[companion] ${model.name} failed, using offline proposals:`, (err as Error).message);
    return proposeOffline(input);
  }
}

export function companionMode(): "gemini" | "offline" {
  return process.env.GEMINI_API_KEY ? "gemini" : "offline";
}

/** Message the organiser can send to a Maybe. Written by the companion, sent by a human. */
export function nudgeMessage(name: string, planTitle: string, deadlineLabel: string, url: string): string {
  return `Hey ${name.split(" ")[0]}, still keen on "${planTitle}"? We're locking it ${deadlineLabel}. Tap In or Out here: ${url}`;
}

export function inviteMessage(planTitle: string, url: string): string {
  return `I'm making a plan: "${planTitle}". Vote on the options and say if you're in (no app needed): ${url}`;
}

export function whatsappLink(text: string, phone?: string): string {
  const digits = phone?.replace(/\D/g, "").replace(/^0/, "27");
  return `https://wa.me/${digits ?? ""}?text=${encodeURIComponent(text)}`;
}
