import "server-only";
import { randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError, normalizePhone } from "./domain";
import { stamp } from "./chat";
import type { SupportTicket } from "./types";

// Support tickets: someone describes a problem (signed in, or from the sign-in screen if they
// can't get in), and the team replies in the admin area. People see replies under Support → My
// tickets, with a pop-up on Android. Safety tickets go to the top.

export const CATEGORIES: Record<SupportTicket["category"], string> = {
  sign_in: "Signing in", payments: "Afriheart+ and payments", safety: "Safety", chats_calls: "Chats and calls",
  dating: "Dating", account: "My account and data", bug: "Something isn't working", other: "Something else",
};
const MAX_OPEN = 5;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function createTicket(personId: string | null, b: Record<string, unknown>) {
  const store = getStore();
  const category = (typeof b.category === "string" && b.category in CATEGORIES ? b.category : "other") as SupportTicket["category"];
  const body = clean(b.body, 4000);
  if (body.length < 10) throw new DomainError("Tell us a little more about what happened (at least a sentence).");
  const subject = clean(b.subject, 120) || body.split(/[.\n]/)[0].slice(0, 80);
  let name = clean(b.name, 60);
  let phone = "";
  if (personId) {
    const me = await store.get("people", personId);
    if (!me) throw new DomainError("Please sign in.", 401);
    name = me.name;
    phone = me.phone;
    const open = (await store.list("support_tickets", { person_id: personId })).filter((t) => t.status !== "resolved");
    if (open.length >= MAX_OPEN) throw new DomainError("You have a few open requests already. Add to one of those under My tickets.");
  } else {
    phone = normalizePhone(clean(b.phone, 20)) ?? "";
    if (!name) throw new DomainError("Add your name, so we know who to help.");
    if (!phone) throw new DomainError("Add the mobile number you use for Afriheart, so we can find you and reply.");
  }
  const email = clean(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("That email address doesn't look right.");
  let attachment: string | null = null;
  if (personId && typeof b.attachment === "string" && b.attachment) {
    const f = await store.get("media_files", b.attachment);
    if (!f || f.owner_id !== personId || f.kind !== "support") throw new DomainError("That screenshot isn't available. Add it again.");
    attachment = f.id;
  }
  const at = stamp();
  const ticket = await store.insert("support_tickets", {
    id: randomUUID(), person_id: personId, contact_name: name, contact_phone: phone, contact_email: email || null, category, subject,
    status: "open", priority: category === "safety" ? "urgent" : "normal", assignee_id: null,
    device_info: b.include_device === true ? clean(b.device_info, 600) || null : null,
    unread_user: false, unread_team: true, created_at: at, updated_at: at,
  });
  await store.insert("support_messages", { id: randomUUID(), ticket_id: ticket.id, from_team: false, author_id: personId, body, attachment_path: attachment, created_at: at });
  return { id: ticket.id };
}

async function ticketFor(personId: string, id: string, asTeam: boolean) {
  const t = await getStore().get("support_tickets", id);
  if (!t) throw new DomainError("Not found.", 404);
  if (asTeam) {
    const { requirePermission } = await import("./admin");
    await requirePermission(personId, "support");
  } else if (t.person_id !== personId) throw new DomainError("Not found.", 404);
  return t;
}

export async function myTickets(personId: string) {
  return (await getStore().list("support_tickets", { person_id: personId }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((t) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, unread: t.unread_user, updated_at: t.updated_at }));
}

export async function unreadSupport(personId: string) {
  return (await getStore().list("support_tickets", { person_id: personId })).filter((t) => t.unread_user).length;
}

export async function thread(personId: string, id: string, asTeam: boolean) {
  const t = await ticketFor(personId, id, asTeam);
  const store = getStore();
  const messages = (await store.list("support_messages", { ticket_id: id })).sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Opening it marks it read on that side.
  if (asTeam && t.unread_team) await store.update("support_tickets", id, { unread_team: false });
  if (!asTeam && t.unread_user) await store.update("support_tickets", id, { unread_user: false });
  const authors = new Map((await store.listIn("people", "id", [...new Set(messages.map((m) => m.author_id).filter((x): x is string => !!x))])).map((p) => [p.id, p.name]));
  return {
    ticket: {
      id: t.id, subject: t.subject, category: t.category, category_label: CATEGORIES[t.category], status: t.status, priority: t.priority, created_at: t.created_at,
      ...(asTeam ? { person_id: t.person_id, contact_name: t.contact_name, contact_phone: t.contact_phone, contact_email: t.contact_email, device_info: t.device_info, assignee_id: t.assignee_id } : {}),
    },
    messages: messages.map((m) => ({
      id: m.id, from_team: m.from_team, body: m.body, attachment: m.attachment_path, created_at: m.created_at,
      // People see "Afriheart support" plus a first name; the team sees full names.
      author: m.from_team ? (asTeam ? authors.get(m.author_id ?? "") ?? "Team" : `${(authors.get(m.author_id ?? "") ?? "Afriheart").split(" ")[0]} from Afriheart support`) : m.author_id ? authors.get(m.author_id) ?? t.contact_name : t.contact_name,
    })),
  };
}

export async function reply(personId: string, id: string, raw: unknown, asTeam: boolean, attachment?: unknown) {
  const t = await ticketFor(personId, id, asTeam);
  const body = clean(raw, 4000);
  if (body.length < 1) throw new DomainError("Write a reply.");
  const store = getStore();
  let path: string | null = null;
  if (!asTeam && typeof attachment === "string" && attachment) {
    const f = await store.get("media_files", attachment);
    if (!f || f.owner_id !== personId || f.kind !== "support") throw new DomainError("That screenshot isn't available.");
    path = f.id;
  }
  const at = stamp();
  await store.insert("support_messages", { id: randomUUID(), ticket_id: id, from_team: asTeam, author_id: personId, body, attachment_path: path, created_at: at });
  await store.update("support_tickets", id, asTeam
    ? { status: t.status === "resolved" ? "resolved" : "waiting", unread_user: true, updated_at: at, assignee_id: t.assignee_id ?? personId }
    : { status: "open", unread_team: true, updated_at: at });
  if (asTeam) {
    const { audit } = await import("./admin");
    await audit(personId, "support_reply", "ticket", id);
    if (t.person_id) {
      const { pushSupport } = await import("./push");
      pushSupport(t.person_id, id, "Afriheart support replied", body);
    }
  }
}

export async function setTicket(personId: string, id: string, b: { status?: unknown; assign?: unknown; priority?: unknown }) {
  await ticketFor(personId, id, true);
  const patch: Partial<SupportTicket> = { updated_at: stamp() };
  if (b.status === "open" || b.status === "waiting" || b.status === "resolved") patch.status = b.status;
  if (b.priority === "normal" || b.priority === "urgent") patch.priority = b.priority;
  if (b.assign === "me") patch.assignee_id = personId;
  if (b.assign === "none") patch.assignee_id = null;
  await getStore().update("support_tickets", id, patch);
  const { audit } = await import("./admin");
  await audit(personId, "support_update", "ticket", id, JSON.stringify({ status: patch.status, priority: patch.priority, assign: b.assign }));
}

/** The team's inbox: unread and urgent first. */
export async function inbox(personId: string, filter: string) {
  const { requirePermission } = await import("./admin");
  await requirePermission(personId, "support");
  const store = getStore();
  let list = await store.list("support_tickets");
  if (filter === "mine") list = list.filter((t) => t.assignee_id === personId && t.status !== "resolved");
  else if (filter === "resolved") list = list.filter((t) => t.status === "resolved");
  else list = list.filter((t) => t.status !== "resolved");
  list.sort((a, b) => (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1) || Number(b.unread_team) - Number(a.unread_team) || a.updated_at.localeCompare(b.updated_at));
  return list.slice(0, 200).map((t) => ({
    id: t.id, subject: t.subject, category: CATEGORIES[t.category], status: t.status, priority: t.priority, unread: t.unread_team,
    contact: t.contact_name, signed_in: !!t.person_id, assignee: t.assignee_id, updated_at: t.updated_at,
  }));
}

export async function canSeeSupportFile(viewerId: string, path: string) {
  const f = await getStore().get("media_files", path);
  if (!f || f.kind !== "support") return false;
  if (f.owner_id === viewerId) return true;
  const { permissions } = await import("./admin");
  return (await permissions(viewerId)).includes("support");
}
