import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { stamp } from "./chat";

// Date deals and events are coming soon. For now people can ask to hear when it opens in their
// city, and venues can say they'd like to take part. Nothing here is shown to other people.

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function notifyMe(personId: string, rawCity: unknown) {
  const city = clean(rawCity, 60);
  if (city.length < 2) throw new DomainError("Which city or town are you in?");
  const store = getStore();
  if (await store.get("deal_interest", personId)) await store.update("deal_interest", personId, { city });
  else await store.insert("deal_interest", { id: personId, person_id: personId, city, created_at: stamp() });
  return { ok: true, city };
}

export async function dealInterest(personId: string) {
  return (await getStore().get("deal_interest", personId))?.city ?? null;
}

export async function venueLead(personId: string, b: Record<string, unknown>) {
  const venue = clean(b.venue, 80), city = clean(b.city, 60), contact = clean(b.contact, 120);
  if (venue.length < 2) throw new DomainError("What's the venue called?");
  if (city.length < 2) throw new DomainError("Which city or town is it in?");
  if (contact.length < 5) throw new DomainError("Add an email or phone number so the team can reach you.");
  const store = getStore();
  if ((await store.list("venue_leads", { person_id: personId })).length >= 5) throw new DomainError("Thanks, the team already has your venues. They'll be in touch.");
  await store.insert("venue_leads", { id: randomUUID(), person_id: personId, venue, city, contact, created_at: stamp() });
  return { ok: true };
}
