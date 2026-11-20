import "server-only";
import { randomInt } from "node:crypto";
import { getStore } from "./store";
import { stamp, postMessage } from "./chat";
import { deleteOwnedMedia } from "./media";
import { endMatchesFor } from "./dating";
import { deleteVouchesFor } from "./vouch";

// Deleting an account (POPIA right to erasure; Apple and Google also require it in the app).
// Likes and their comments go with the swipes; voice prompts go with the uploaded files.
//
// Everything personal goes: the dating profile and its photos, compatibility
// answers, location, verification records and selfies, everything the person
// sent in chats (messages, photos, voice notes, album stories), their devices,
// push tokens, sign-in sessions and codes, memories and preferences. The
// person row stays only as an anonymous "Deleted account" so other people's
// chats and plans still make sense. Reports about the person are kept,
// unlinked from any profile, for safety reasons (see the privacy policy).

const anonymousPhone = () => `00${Array.from({ length: 13 }, () => randomInt(0, 10)).join("")}`;

export async function deleteAccount(personId: string) {
  const store = getStore();
  const person = await store.get("people", personId);
  if (!person) return;
  const at = stamp();

  // Dating
  await endMatchesFor(personId, personId, "This match has ended. The other person deleted their account.");
  const profile = await store.get("dating_profiles", personId);
  if (profile) await store.remove("dating_profiles", personId);
  for (const s of [...(await store.list("swipes", { from_id: personId })), ...(await store.list("swipes", { to_id: personId }))]) await store.remove("swipes", s.id);
  for (const v of await store.list("verifications", { person_id: personId })) await store.remove("verifications", v.id);
  for (const b of await store.list("blocks", { blocker: personId })) await store.remove("blocks", b.id);
  for (const d of [...(await store.list("duos", { a: personId })), ...(await store.list("duos", { b: personId }))]) {
    if (d.status !== "ended") await store.update("duos", d.id, { status: "ended" });
  }
  for (const w of await store.list("we_met", { from_id: personId })) await store.remove("we_met", w.id);
  for (const p of await store.list("daily_picks", { person_id: personId })) await store.remove("daily_picks", p.id);
  await deleteVouchesFor(personId);
  // Chat extras and status updates
  const { deleteStatusesOf } = await import("./status");
  await deleteStatusesOf(personId);
  for (const x of await store.list("stars", { person_id: personId })) await store.remove("stars", x.id);
  for (const x of await store.list("message_hides", { person_id: personId })) await store.remove("message_hides", x.id);
  for (const x of await store.list("chat_lists", { person_id: personId })) await store.remove("chat_lists", x.id);
  // Support: their tickets stay for the team's records, without their name, number or words.
  for (const t of await store.list("support_tickets", { person_id: personId })) {
    for (const m of await store.list("support_messages", { ticket_id: t.id })) {
      if (!m.from_team) await store.update("support_messages", m.id, { body: "(deleted with the account)", attachment_path: null });
    }
    await store.update("support_tickets", t.id, { person_id: null, contact_name: "Deleted account", contact_phone: "", contact_email: null, device_info: null, status: "resolved" });
  }
  for (const f of (await store.list("media_files", { owner_id: personId })).filter((f) => f.kind === "support")) await deleteOwnedMedia(f.id).catch(() => undefined);
  if (await store.get("staff", personId)) await store.remove("staff", personId);
  for (const a of await store.list("couple_answers", { person_id: personId })) await store.remove("couple_answers", a.id);
  const interest = await store.get("deal_interest", personId);
  if (interest) await store.remove("deal_interest", personId);
  for (const v of await store.list("venue_leads", { person_id: personId })) await store.remove("venue_leads", v.id);
  // Payment records are kept for the tax and accounting law (no card details are ever stored here).

  // Every file they uploaded: profile photos, chat photos and voice notes, selfies
  for (const f of await store.list("media_files", { owner_id: personId })) await deleteOwnedMedia(f.id).catch(() => undefined);

  // What they sent in chats becomes "This message was deleted", then they leave every chat
  for (const m of await store.list("messages", { sender_id: personId })) {
    await store.update("messages", m.id, { kind: "system", body: "This message was deleted", media_path: null, media_ms: null, cipher: null, awaiting: [], updated_at: at });
  }
  for (const member of await store.list("chat_members", { person_id: personId })) {
    const chat = await store.get("chats", member.chat_id);
    await store.remove("chat_members", member.id);
    if (chat?.kind === "group") await postMessage(chat.id, null, "system", "Someone left the group and deleted their account.");
  }

  // Devices, push tokens, sessions, codes, memories, circles
  for (const d of await store.list("devices", { person_id: personId })) await store.remove("devices", d.id);
  for (const d of await store.list("android_devices", { person_id: personId })) await store.remove("android_devices", d.id);
  for (const s of await store.list("sessions", { person_id: personId })) await store.remove("sessions", s.id);
  for (const c of await store.list("phone_codes", { phone: person.phone })) await store.remove("phone_codes", c.id);
  for (const m of await store.list("memories", { person_id: personId })) await store.remove("memories", m.id);
  for (const c of await store.list("circle_members", { person_id: personId })) await store.remove("circle_members", c.id);

  // An anonymous placeholder, so other people's chats and plans still read sensibly
  await store.update("people", personId, { name: "Deleted account", phone: anonymousPhone(), is_guest: true, home_area: null, budget: null, availability: [], last_seen_at: null, hide_last_seen: true });
}
