import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { stamp } from "./chat";
import { ageOn } from "./matching";
import { deleteOwnedMedia as deleteMedia } from "./media";
import type { Report, Verification } from "./types";

// Selfie verification and the Afriheart team's review queue.
//
// A verification starts with a pose the server picks (so it can't be a photo
// taken earlier), then a live selfie from the camera. A person on the team
// compares it with the profile photos. The selfie is biometric information
// (POPIA s26), so it's only shown to the team and deleted as soon as it's
// checked; only the result is kept.

export const GESTURES = [
  "Give a thumbs up",
  "Make a peace sign next to your face",
  "Touch your nose with one finger",
  "Put your hand on top of your head",
  "Hold up three fingers",
  "Cover one eye with your hand",
  "Wave at the camera",
  "Point at your ear",
];

export const REJECT_REASONS: Record<string, string> = {
  not_matching: "The selfie doesn't look like the person in your photos.",
  pose: "We couldn't see the pose we asked for.",
  unclear: "The selfie was too dark or blurry to check.",
  face_hidden: "We couldn't see your face clearly (sunglasses, mask or filter).",
  other: "We couldn't verify this selfie.",
};

/** The safety team: moderators and super admins (TEAM_PHONES, SUPER_ADMIN_PHONES, or added in /admin). */
export async function isTeam(personId: string | null): Promise<boolean> {
  const { permissions } = await import("./admin");
  return (await permissions(personId)).includes("safety");
}

async function requireTeam(personId: string) {
  if (!(await isTeam(personId))) throw new DomainError("This is only for the Afriheart team.");
}

async function latest(personId: string): Promise<Verification | null> {
  const rows = await getStore().list("verifications", { person_id: personId });
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export interface VerifyStatus {
  state: "none" | "started" | "pending" | "approved" | "rejected";
  gesture: string | null;
  reason: string | null;
  verified_at: string | null;
}

export async function verifyStatus(personId: string): Promise<VerifyStatus> {
  const [v, profile] = await Promise.all([latest(personId), getStore().get("dating_profiles", personId)]);
  if (profile?.verified_at) return { state: "approved", gesture: null, reason: null, verified_at: profile.verified_at };
  if (!v) return { state: "none", gesture: null, reason: null, verified_at: null };
  return {
    state: v.status, gesture: v.status === "started" ? v.gesture : null,
    reason: v.status === "rejected" ? REJECT_REASONS[v.reason ?? "other"] ?? REJECT_REASONS.other : null, verified_at: null,
  };
}

/** Gives a fresh pose to do in the selfie. */
export async function startVerification(personId: string): Promise<VerifyStatus> {
  const store = getStore();
  const profile = await store.get("dating_profiles", personId);
  if (!profile) throw new DomainError("Create your dating profile first.");
  if (profile.verified_at) return verifyStatus(personId);
  const v = await latest(personId);
  if (v?.status === "pending") throw new DomainError("Your selfie is already with the team. It's usually checked within a day.");
  for (const old of await store.list("verifications", { person_id: personId, status: "started" })) await store.remove("verifications", old.id);
  await store.insert("verifications", {
    id: randomUUID(), person_id: personId, gesture: GESTURES[Math.floor(Math.random() * GESTURES.length)], status: "started",
    selfie_path: null, reason: null, consent_at: null, created_at: stamp(), submitted_at: null, reviewed_at: null, reviewed_by: null,
  });
  return verifyStatus(personId);
}

/** Saves the live selfie for the team to check. */
export async function submitSelfie(personId: string, bytes: Uint8Array, consent: boolean): Promise<VerifyStatus> {
  if (!consent) throw new DomainError("Please agree to how Afriheart uses your selfie.");
  const store = getStore();
  const v = await latest(personId);
  if (!v || v.status !== "started") throw new DomainError("Start again: tap Verify to get a pose.");
  if (Date.now() - Date.parse(v.created_at) > 15 * 60 * 1000) throw new DomainError("That pose has expired. Start again for a new one.");
  if (bytes.length < 5000) throw new DomainError("That selfie didn't come through. Try again.");
  const { saveOwnedMedia } = await import("./media");
  const path = await saveOwnedMedia(personId, "selfie", "selfies", bytes, "image/jpeg");
  await store.update("verifications", v.id, { status: "pending", selfie_path: path, consent_at: stamp(), submitted_at: stamp() });
  return verifyStatus(personId);
}

/** Can this person see this selfie? Only the team. */
export async function canSeeSelfie(personId: string, path: string): Promise<boolean> {
  if (!(await isTeam(personId))) return false;
  return (await getStore().list("verifications", { selfie_path: path })).length > 0;
}

export interface QueueItem {
  id: string;
  name: string;
  age: number;
  gesture: string;
  selfie: string;
  photos: string[];
  submitted_at: string;
}

export async function verificationQueue(personId: string): Promise<QueueItem[]> {
  await requireTeam(personId);
  const store = getStore();
  const rows = (await store.list("verifications", { status: "pending" })).sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const out: QueueItem[] = [];
  for (const v of rows) {
    const p = await store.get("dating_profiles", v.person_id);
    if (!p || !v.selfie_path) continue;
    out.push({ id: v.id, name: p.display_name, age: ageOn(p.birthdate, new Date()), gesture: v.gesture, selfie: v.selfie_path, photos: p.photos, submitted_at: v.submitted_at ?? v.created_at });
  }
  return out;
}

export async function reviewVerification(personId: string, id: string, decision: string, reason: string) {
  await requireTeam(personId);
  const store = getStore();
  const v = await store.get("verifications", id);
  if (!v || v.status !== "pending") throw new DomainError("That selfie has already been checked.");
  if (decision !== "approve" && decision !== "reject") throw new DomainError("Approve or reject.");
  if (decision === "reject" && !REJECT_REASONS[reason]) throw new DomainError("Choose a reason.");
  const at = stamp();
  if (v.selfie_path) await deleteMedia(v.selfie_path); // biometric: gone as soon as it's checked
  await store.update("verifications", id, {
    status: decision === "approve" ? "approved" : "rejected", reason: decision === "reject" ? reason : null,
    selfie_path: null, reviewed_at: at, reviewed_by: personId,
  });
  if (decision === "approve") await store.update("dating_profiles", v.person_id, { verified_at: at });
  const { audit } = await import("./admin");
  await audit(personId, decision === "approve" ? "approve_selfie" : "reject_selfie", "person", v.person_id, decision === "reject" ? reason : "");
}

export interface ReportItem {
  id: string;
  reason: Report["reason"];
  details: string;
  created_at: string;
  reporter: string;
  reported: { id: string; name: string; photos: string[]; verified: boolean; removed: boolean; reports: number } | null;
}

export async function reportQueue(personId: string): Promise<ReportItem[]> {
  await requireTeam(personId);
  const store = getStore();
  const all = await store.list("reports");
  const urgent = (r: Report) => (r.reason === "underage" || r.reason === "safety" ? 0 : 1);
  const open = all.filter((r) => r.status === "open").sort((a, b) => urgent(a) - urgent(b) || a.created_at.localeCompare(b.created_at));
  const out: ReportItem[] = [];
  for (const r of open) {
    const [reporter, profile, person] = await Promise.all([store.get("people", r.reporter), store.get("dating_profiles", r.reported), store.get("people", r.reported)]);
    out.push({
      id: r.id, reason: r.reason, details: r.details, created_at: r.created_at, reporter: reporter?.name ?? "Someone",
      reported: person ? {
        id: person.id, name: profile?.display_name ?? person.name, photos: profile?.photos ?? [], verified: !!profile?.verified_at,
        removed: !!profile?.removed_at, reports: all.filter((x) => x.reported === r.reported).length,
      } : null,
    });
  }
  return out;
}

/** Close a report: no action, or remove the reported person from dating (which also closes their other open reports). */
export async function reviewReport(personId: string, id: string, action: string) {
  await requireTeam(personId);
  const store = getStore();
  const r = await store.get("reports", id);
  if (!r || r.status !== "open") throw new DomainError("That report has already been reviewed.");
  if (action !== "no_action" && action !== "remove") throw new DomainError("Choose what to do.");
  const at = stamp();
  const close = (rid: string, outcome: "no_action" | "removed") => store.update("reports", rid, { status: "reviewed", outcome, reviewed_at: at, reviewed_by: personId });
  if (action === "remove") {
    if (await store.get("dating_profiles", r.reported)) await store.update("dating_profiles", r.reported, { removed_at: at });
    const { endMatchesFor } = await import("./dating");
    await endMatchesFor(r.reported, personId, "This match has ended. The other person is no longer on Afriheart dating.");
    for (const other of await store.list("reports", { reported: r.reported, status: "open" })) await close(other.id, "removed");
  } else {
    await close(id, "no_action");
  }
  const { audit } = await import("./admin");
  await audit(personId, action === "remove" ? "report_remove" : "report_no_action", "person", r.reported, r.reason);
}
