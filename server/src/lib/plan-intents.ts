import "server-only";
import * as D from "./domain";
import { fromLocalInput } from "./time";
import type { Response } from "./types";

/** Every plan button (web page, chat card, Android) runs through here. Returns where to go next, if anywhere. */
export async function runPlanIntent(slug: string, personId: string, input: Record<string, string>, origin: string): Promise<string | null> {
  const get = (k: string) => input[k] ?? "";
  switch (get("intent")) {
    case "vote":
      await D.toggleVote(slug, personId, get("option_id"));
      return null;
    case "respond": {
      const r = get("response");
      if (!["in", "maybe", "out"].includes(r)) throw new D.DomainError("Choose In, Maybe or Out.");
      await D.respond(slug, personId, r as Response);
      return null;
    }
    case "send-poll": {
      const deadline = get("deadline_iso") ? new Date(get("deadline_iso")) : fromLocalInput(get("deadline"));
      if (!deadline || Number.isNaN(deadline.getTime())) throw new D.DomainError("Pick a deadline for the vote.");
      await D.sendPoll(slug, personId, deadline);
      return "shared";
    }
    case "lock":
      await D.lockPlan(slug, personId, get("option_id") || undefined);
      return null;
    case "drop":
      await D.dropPlan(slug, personId);
      return null;
    case "nudge":
      await D.prepareNudges(slug, personId, `${origin}/p/${slug}`);
      return null;
    case "checkin":
      await D.checkIn(slug, personId, null);
      return null;
    case "again":
      await D.setAgain(slug, personId, get("again") === "yes");
      return null;
    case "add-option": {
      const startsAt = fromLocalInput(get("starts_at"));
      if (!startsAt) throw new D.DomainError("Pick a date and time.");
      const cost = get("cost").trim();
      await D.addOption(slug, personId, {
        what: get("what"), where_name: get("where_name"), starts_at: startsAt,
        cost: cost ? Math.max(0, Math.round(Number(cost))) || null : null,
      });
      return null;
    }
    case "remove-option":
      await D.removeOption(slug, personId, get("option_id"));
      return null;
    case "make-circle": {
      const circle = await D.makeCircle(slug, personId, get("name"));
      return `/circles/${circle.id}`;
    }
    default:
      throw new D.DomainError("Unknown action.");
  }
}
