import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, normalizePhone } from "./domain";
import { stamp } from "./chat";
import type { Person, StaffRole } from "./types";

// The super admin side. Three roles:
//   super_admin  everything: people, payments, gifts of Afriheart+, announcements, the team, the log
//   moderator    safety: reports, selfie checks, banning, removing from dating, support
//   support      support tickets, and looking people up to help them
// SUPER_ADMIN_PHONES (env) are always super admins, so you can never lock yourselves out.
// TEAM_PHONES (env) are moderators, as before. Everyone else is added in the admin area.
// Staff can never read anyone's private messages: they're end-to-end encrypted.

export type Permission = "dashboard" | "users" | "support" | "safety" | "ban" | "grant_plus" | "delete_account" | "payments" | "announcements" | "staff" | "audit" | "leads";
const CAN: Record<StaffRole, Permission[]> = {
  super_admin: ["dashboard", "users", "support", "safety", "ban", "grant_plus", "delete_account", "payments", "announcements", "staff", "audit", "leads"],
  moderator: ["dashboard", "users", "support", "safety", "ban"],
  support: ["dashboard", "users", "support"],
};
export const ROLE_LABELS: Record<StaffRole, string> = { super_admin: "Super admin", moderator: "Moderator", support: "Support" };

const phones = (v: string | undefined) => (v ?? "").split(",").map((p) => normalizePhone(p.trim())).filter((p): p is string => !!p);

export async function staffRole(personId: string | null): Promise<StaffRole | null> {
  if (!personId) return null;
  const store = getStore();
  const person = await store.get("people", personId);
  if (!person || person.banned_at) return null;
  if (phones(process.env.SUPER_ADMIN_PHONES).includes(person.phone)) return "super_admin";
  const row = await store.get("staff", personId);
  if (row) return row.role;
  if (phones(process.env.TEAM_PHONES).includes(person.phone)) return "moderator";
  return null;
}

export async function permissions(personId: string | null): Promise<Permission[]> {
  const role = await staffRole(personId);
  return role ? CAN[role] : [];
}

export async function requirePermission(personId: string, p: Permission): Promise<StaffRole> {
  const role = await staffRole(personId);
  if (!role) throw new DomainError("This is only for the Afriheart team.", 403);
  if (!CAN[role].includes(p)) throw new DomainError(`Your role (${ROLE_LABELS[role]}) can't do that.`, 403);
  return role;
}

export async function audit(actorId: string, action: string, targetType: string, targetId: string | null, details = "") {
  await getStore().insert("admin_audit", { id: randomUUID(), actor_id: actorId, action, target_type: targetType, target_id: targetId, details: details.slice(0, 500), created_at: stamp() });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export async function dashboard(personId: string) {
  await requirePermission(personId, "dashboard");
  const store = getStore();
  const now = Date.now();
  const since = (days: number) => new Date(now - days * 86400_000).toISOString();
  const [people, profiles, matches, payments, reports, verifications, tickets, weMet] = await Promise.all([
    store.list("people"), store.list("dating_profiles"), store.list("matches"), store.list("payments"),
    store.list("reports", { status: "open" }), store.list("verifications", { status: "pending" }), store.list("support_tickets"), store.list("we_met"),
  ]);
  const real = people.filter((p) => !p.is_guest);
  const paid = payments.filter((p) => p.status === "complete" && p.provider !== "gift");
  const sum = (list: typeof paid) => list.reduce((n, p) => n + p.amount_cents, 0);
  const memberships = await store.list("memberships");
  const nowIso = new Date().toISOString();
  return {
    people: {
      total: real.length,
      new_today: real.filter((p) => p.created_at >= since(1)).length,
      new_7d: real.filter((p) => p.created_at >= since(7)).length,
      new_30d: real.filter((p) => p.created_at >= since(30)).length,
      active_today: real.filter((p) => p.last_seen_at && p.last_seen_at >= since(1)).length,
      active_7d: real.filter((p) => p.last_seen_at && p.last_seen_at >= since(7)).length,
      banned: real.filter((p) => p.banned_at).length,
    },
    dating: {
      profiles: profiles.filter((p) => !p.removed_at).length,
      verified: profiles.filter((p) => p.verified_at).length,
      matches_7d: matches.filter((m) => m.created_at >= since(7)).length,
      matches_total: matches.length,
      dates_met: weMet.filter((w) => w.met).length,
    },
    plus: {
      active: memberships.filter((m) => m.plus_until > nowIso).length,
      on_trial: memberships.filter((m) => m.trial_until && m.trial_until > nowIso && m.plus_until === m.trial_until).length,
      revenue_30d_cents: sum(paid.filter((p) => (p.paid_at ?? p.created_at) >= since(30))),
      revenue_total_cents: sum(paid),
      payments_30d: paid.filter((p) => (p.paid_at ?? p.created_at) >= since(30)).length,
    },
    queues: {
      reports: reports.length,
      urgent_reports: reports.filter((r) => r.reason === "underage" || r.reason === "safety").length,
      selfies: verifications.length,
      tickets_open: tickets.filter((t) => t.status !== "resolved").length,
      tickets_unread: tickets.filter((t) => t.status !== "resolved" && t.unread_team).length,
    },
    // New people per day for the last 14 days.
    signups: Array.from({ length: 14 }, (_, i) => {
      const day = new Date(now - (13 - i) * 86400_000).toISOString().slice(0, 10);
      return { day, count: real.filter((p) => p.created_at.slice(0, 10) === day).length };
    }),
  };
}

// ── People ───────────────────────────────────────────────────────────────────

const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-3)}` : p);

export async function searchPeople(personId: string, q: string) {
  const role = await requirePermission(personId, "users");
  const store = getStore();
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const local = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
  let people = (await store.list("people")).filter((p) => !p.is_guest || p.banned_at);
  if (needle) people = people.filter((p) => p.name.toLowerCase().includes(needle) || (local.length >= 4 && p.phone.includes(local)) || p.id === needle);
  people.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return people.slice(0, 50).map((p) => ({
    id: p.id, name: p.name, phone: role === "support" ? maskPhone(p.phone) : p.phone, created_at: p.created_at, last_seen_at: p.last_seen_at ?? null, banned: !!p.banned_at,
  }));
}

export async function personDetail(personId: string, id: string) {
  const role = await requirePermission(personId, "users");
  const store = getStore();
  const p = await store.get("people", id);
  if (!p) throw new DomainError("Not found.", 404);
  const [profile, membership, payments, reportsAbout, reportsBy, devices, tickets, chats, verifications] = await Promise.all([
    store.get("dating_profiles", id), store.get("memberships", id), store.list("payments", { person_id: id }),
    store.list("reports", { reported: id }), store.list("reports", { reporter: id }), store.list("devices", { person_id: id }),
    store.list("support_tickets", { person_id: id }), store.list("chat_members", { person_id: id }), store.list("verifications", { person_id: id }),
  ]);
  const nowIso = new Date().toISOString();
  return {
    id: p.id, name: p.name, phone: role === "support" ? maskPhone(p.phone) : p.phone, created_at: p.created_at, last_seen_at: p.last_seen_at ?? null,
    banned: p.banned_at ? { at: p.banned_at, reason: p.banned_reason ?? "" } : null,
    staff_role: await staffRole(id),
    dating: profile ? {
      name: profile.display_name, area: profile.area, photos: profile.photos, verified: !!profile.verified_at, paused: !!profile.paused, removed: !!profile.removed_at,
      created_at: profile.created_at,
    } : null,
    plus: membership && membership.plus_until > nowIso ? { until: membership.plus_until, trial: !!membership.trial_until && membership.plus_until === membership.trial_until } : null,
    payments: role === "support" ? [] : payments.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x) => ({ id: x.id, pass: x.pass, amount_cents: x.amount_cents, status: x.status, method: x.method, provider: x.provider, created_at: x.created_at })),
    reports_about: reportsAbout.map((r) => ({ id: r.id, reason: r.reason, status: r.status, outcome: r.outcome ?? null, created_at: r.created_at })),
    reports_made: reportsBy.length,
    devices: devices.filter((d) => !d.revoked_at).length,
    chats: chats.length,
    verification: verifications.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, created_at: t.created_at })),
  };
}

export async function banPerson(personId: string, id: string, reason: string) {
  await requirePermission(personId, "ban");
  if (id === personId) throw new DomainError("You can't ban yourself.");
  if (await staffRole(id) === "super_admin") throw new DomainError("Super admins can't be banned here.");
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) throw new DomainError("Say why (only the team sees this).");
  const store = getStore();
  const at = stamp();
  await store.update("people", id, { banned_at: at, banned_reason: why });
  if (await store.get("dating_profiles", id)) await store.update("dating_profiles", id, { removed_at: at });
  const { endMatchesFor } = await import("./dating");
  await endMatchesFor(id, personId, "This match has ended. The other person is no longer on Afriheart.");
  const { revokeSessions } = await import("./session");
  await revokeSessions(id);
  await audit(personId, "ban", "person", id, why);
}

export async function unbanPerson(personId: string, id: string) {
  await requirePermission(personId, "ban");
  const store = getStore();
  await store.update("people", id, { banned_at: null, banned_reason: null });
  await audit(personId, "unban", "person", id);
}

/** Remove from dating (or bring back), without banning from chats. */
export async function setDatingRemoved(personId: string, id: string, removed: boolean) {
  await requirePermission(personId, "safety");
  const store = getStore();
  if (!(await store.get("dating_profiles", id))) throw new DomainError("They don't have a dating profile.");
  await store.update("dating_profiles", id, { removed_at: removed ? stamp() : null });
  if (removed) {
    const { endMatchesFor } = await import("./dating");
    await endMatchesFor(id, personId, "This match has ended. The other person is no longer on Afriheart dating.");
  }
  await audit(personId, removed ? "remove_from_dating" : "restore_to_dating", "person", id);
}

/** A gift of Afriheart+ days (a goodwill gesture, a prize, a refund made good). */
export async function grantPlus(personId: string, id: string, days: number, note: string) {
  await requirePermission(personId, "grant_plus");
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new DomainError("Choose between 1 and 365 days.");
  const store = getStore();
  if (!(await store.get("people", id))) throw new DomainError("Not found.", 404);
  const at = stamp();
  const current = await store.get("memberships", id);
  const from = current && current.plus_until > at ? new Date(current.plus_until) : new Date();
  const until = new Date(from.getTime() + days * 86400_000).toISOString();
  if (current) await store.update("memberships", id, { plus_until: until, updated_at: at });
  else await store.insert("memberships", { id, person_id: id, plus_until: until, updated_at: at });
  await audit(personId, "grant_plus", "person", id, `${days} days${note.trim() ? `: ${note.trim()}` : ""}`);
  return { until };
}

export async function adminDeleteAccount(personId: string, id: string, confirmName: string) {
  await requirePermission(personId, "delete_account");
  if (id === personId) throw new DomainError("Delete your own account from the You tab.");
  const store = getStore();
  const p = await store.get("people", id);
  if (!p) throw new DomainError("Not found.", 404);
  if (confirmName.trim() !== p.name) throw new DomainError(`Type their name exactly (${p.name}) to confirm.`);
  const { deleteAccount } = await import("./account");
  await deleteAccount(id);
  await audit(personId, "delete_account", "person", id, p.name);
}

// ── Payments ─────────────────────────────────────────────────────────────────

export async function paymentsList(personId: string) {
  await requirePermission(personId, "payments");
  const store = getStore();
  const list = (await store.list("payments")).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  const people = new Map((await store.listIn("people", "id", list.map((p) => p.person_id).filter(Boolean))).map((p) => [p.id, p]));
  return list.map((p) => ({ ...p, person_name: people.get(p.person_id)?.name ?? "Deleted account" }));
}

/**
 * Records a refund. The money itself goes back from the Payfast dashboard (Transactions → Refund);
 * this marks the payment refunded and takes the days off the person's Afriheart+.
 */
export async function refundPayment(personId: string, id: string, note: string) {
  await requirePermission(personId, "payments");
  const store = getStore();
  const p = await store.get("payments", id);
  if (!p || p.status !== "complete") throw new DomainError("Only completed payments can be refunded.");
  await store.update("payments", id, { status: "refunded" });
  const { PASSES } = await import("./plus");
  const m = await store.get("memberships", p.person_id);
  if (m) {
    const until = new Date(Math.max(Date.now(), Date.parse(m.plus_until) - PASSES[p.pass].days * 86400_000)).toISOString();
    await store.update("memberships", p.person_id, { plus_until: until, updated_at: stamp() });
  }
  await audit(personId, "refund", "payment", id, note.trim().slice(0, 300));
}

// ── Announcements ────────────────────────────────────────────────────────────

export async function activeAnnouncement() {
  const now = new Date().toISOString();
  const list = (await getStore().list("announcements", { active: true })).filter((a) => !a.ends_at || a.ends_at > now);
  const a = list.sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  return a ? { id: a.id, text: a.text, kind: a.kind } : null;
}

export async function announcements(personId: string) {
  await requirePermission(personId, "announcements");
  return (await getStore().list("announcements")).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
}

export async function postAnnouncement(personId: string, text: string, kind: string, hours: number | null) {
  await requirePermission(personId, "announcements");
  const t = text.trim().slice(0, 240);
  if (t.length < 5) throw new DomainError("Write the announcement.");
  const store = getStore();
  for (const a of await store.list("announcements", { active: true })) await store.update("announcements", a.id, { active: false });
  const row = await store.insert("announcements", {
    id: randomUUID(), text: t, kind: kind === "warning" ? "warning" : "info", active: true, created_by: personId, created_at: stamp(),
    ends_at: hours && hours > 0 ? new Date(Date.now() + Math.min(hours, 24 * 30) * 3600_000).toISOString() : null,
  });
  await audit(personId, "announce", "announcement", row.id, t);
  return row;
}

export async function endAnnouncement(personId: string, id: string) {
  await requirePermission(personId, "announcements");
  await getStore().update("announcements", id, { active: false });
  await audit(personId, "end_announcement", "announcement", id);
}

// ── The team ─────────────────────────────────────────────────────────────────

export async function staffList(personId: string) {
  await requirePermission(personId, "staff");
  const store = getStore();
  const rows = await store.list("staff");
  const envSupers = phones(process.env.SUPER_ADMIN_PHONES);
  const envMods = phones(process.env.TEAM_PHONES);
  const people = await store.list("people");
  const out = new Map<string, { id: string; name: string; phone: string; role: StaffRole; fixed: boolean }>();
  for (const p of people) {
    if (envSupers.includes(p.phone)) out.set(p.id, { id: p.id, name: p.name, phone: p.phone, role: "super_admin", fixed: true });
  }
  for (const r of rows) {
    const p = people.find((x) => x.id === r.person_id);
    if (p && !out.has(p.id)) out.set(p.id, { id: p.id, name: p.name, phone: p.phone, role: r.role, fixed: false });
  }
  for (const p of people) {
    if (envMods.includes(p.phone) && !out.has(p.id)) out.set(p.id, { id: p.id, name: p.name, phone: p.phone, role: "moderator", fixed: true });
  }
  return [...out.values()];
}

export async function setStaff(personId: string, phone: string, role: string | null) {
  await requirePermission(personId, "staff");
  const n = normalizePhone(phone);
  if (!n) throw new DomainError("Enter their mobile number.");
  const store = getStore();
  const person = (await store.list("people", { phone: n } as Partial<Person>))[0];
  if (!person || person.is_guest) throw new DomainError("They need to sign in to Afriheart once first.");
  if (phones(process.env.SUPER_ADMIN_PHONES).includes(n)) throw new DomainError("That number is a super admin in the server settings (SUPER_ADMIN_PHONES).");
  if (person.id === personId) throw new DomainError("You can't change your own role.");
  const existing = await store.get("staff", person.id);
  if (role === null) {
    if (existing) await store.remove("staff", person.id);
    await audit(personId, "remove_staff", "person", person.id);
    return;
  }
  if (!(role in CAN)) throw new DomainError("Choose a role.");
  if (existing) await store.update("staff", person.id, { role: role as StaffRole });
  else await store.insert("staff", { id: person.id, person_id: person.id, role: role as StaffRole, added_by: personId, created_at: stamp() });
  await audit(personId, "set_staff", "person", person.id, role);
}

export async function auditLog(personId: string) {
  await requirePermission(personId, "audit");
  const store = getStore();
  const rows = (await store.list("admin_audit")).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 300);
  const people = new Map((await store.listIn("people", "id", [...new Set(rows.flatMap((r) => [r.actor_id, r.target_type === "person" ? r.target_id ?? "" : ""]).filter(Boolean))])).map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...r, actor: people.get(r.actor_id) ?? "Someone", target: r.target_type === "person" ? people.get(r.target_id ?? "") ?? r.target_id : r.target_id }));
}

export async function leads(personId: string) {
  await requirePermission(personId, "leads");
  const store = getStore();
  const [venues, interest] = await Promise.all([store.list("venue_leads"), store.list("deal_interest")]);
  const byArea = new Map<string, number>();
  for (const i of interest) byArea.set(i.city, (byArea.get(i.city) ?? 0) + 1);
  return { venues: venues.sort((a, b) => b.created_at.localeCompare(a.created_at)), interest: [...byArea.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count) };
}
