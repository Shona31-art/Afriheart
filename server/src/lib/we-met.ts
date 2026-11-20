import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { membership, stamp } from "./chat";

// "We met": a private check-in after a planned date, like Hinge's. Asked in a
// match chat once a locked plan's time has passed (or an alphabet date is
// ticked off). Answers are never shown to the other person. "Didn't look like
// their photos" goes to the team's report queue; the rest counts how many
// matches turn into real dates.

const AFTER_MS = 2 * 60 * 60 * 1000; // two hours after the planned time
const ASK_AGAIN_MS = 3 * 24 * 60 * 60 * 1000; // "not yet": ask again in three days

export interface WeMetAsk { about_id: string; name: string }

async function matchFor(chatId: string, personId: string) {
  const { chat } = await membership(chatId, personId);
  if (chat.origin !== "match") return null;
  const store = getStore();
  const m = (await store.list("matches", { chat_id: chatId }))[0];
  if (!m || m.ended_at) return null;
  return m;
}

/** Should this person be asked "Did you meet?" in this chat right now? */
export async function weMetAsk(chatId: string, personId: string): Promise<WeMetAsk | null> {
  const m = await matchFor(chatId, personId);
  if (!m) return null;
  const store = getStore();
  const mine = (await store.list("we_met", { chat_id: chatId, from_id: personId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (mine.some((r) => r.met !== null)) return null;
  if (mine[0] && Date.now() - Date.parse(mine[0].created_at) < ASK_AGAIN_MS) return null;

  let happened = (await store.list("az_dates", { chat_id: chatId })).some((d) => d.status === "done");
  if (!happened) {
    for (const plan of await store.list("plans", { chat_id: chatId })) {
      if (!plan.locked_option_id) continue;
      const opt = await store.get("plan_options", plan.locked_option_id);
      if (opt && Date.parse(opt.starts_at) + AFTER_MS < Date.now()) { happened = true; break; }
    }
  }
  if (!happened) return null;
  const about = m.a === personId ? m.b : m.a;
  const p = await store.get("dating_profiles", about);
  return { about_id: about, name: p?.display_name ?? "them" };
}

/** { met: true|false|null (not yet), again?: "yes"|"maybe"|"no", as_pictured?: boolean } */
export async function answerWeMet(chatId: string, personId: string, raw: { met?: unknown; again?: unknown; as_pictured?: unknown }) {
  const ask = await weMetAsk(chatId, personId);
  if (!ask) throw new DomainError("There's nothing to answer here right now.");
  const met = raw.met === true ? true : raw.met === false ? false : null;
  const again = met && ["yes", "maybe", "no"].includes(String(raw.again)) ? (String(raw.again) as "yes" | "maybe" | "no") : null;
  const asPictured = met && typeof raw.as_pictured === "boolean" ? raw.as_pictured : null;
  const store = getStore();
  await store.insert("we_met", { id: randomUUID(), chat_id: chatId, from_id: personId, about_id: ask.about_id, met, again, as_pictured: asPictured, created_at: stamp() });
  if (asPictured === false) {
    await store.insert("reports", {
      id: randomUUID(), reporter: personId, reported: ask.about_id, reason: "fake",
      details: "From \"We met\": they didn't look like their photos.", created_at: stamp(), status: "open",
    });
  }
  return { ok: true };
}

/** For the team: how many matches turned into real dates. */
export async function weMetStats() {
  const rows = (await getStore().list("we_met")).filter((r) => r.met !== null);
  const met = rows.filter((r) => r.met);
  return {
    answered: rows.length,
    met: met.length,
    again: met.filter((r) => r.again === "yes").length,
    not_as_pictured: met.filter((r) => r.as_pictured === false).length,
  };
}
