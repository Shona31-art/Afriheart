"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, clock, dayLabel, formatPhone } from "@/lib/client";
import { TicketThread } from "./support";
import { IconSearch } from "./icons";

type Perm = "dashboard" | "users" | "support" | "safety" | "ban" | "grant_plus" | "delete_account" | "payments" | "announcements" | "staff" | "audit" | "leads";
type Tab = "dashboard" | "people" | "support" | "safety" | "payments" | "announcements" | "team" | "activity" | "leads";
const TABS: { id: Tab; label: string; perm: Perm }[] = [
  { id: "dashboard", label: "Dashboard", perm: "dashboard" },
  { id: "people", label: "People", perm: "users" },
  { id: "support", label: "Support", perm: "support" },
  { id: "safety", label: "Safety", perm: "safety" },
  { id: "payments", label: "Payments", perm: "payments" },
  { id: "announcements", label: "Announcements", perm: "announcements" },
  { id: "team", label: "Team", perm: "staff" },
  { id: "activity", label: "Activity log", perm: "audit" },
  { id: "leads", label: "Venues and deals", perm: "leads" },
];
const rand = (c: number) => `R${(c / 100).toLocaleString("en-ZA", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const when = (iso: string | null) => (iso ? `${dayLabel(iso)} ${clock(iso)}` : "never");

function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!url) return;
    apiGet<T>(url).then((d) => { setData(d); setError(null); }, (e) => setError((e as Error).message));
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load, setData };
}

function Notice({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" className="mb-3 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>;
  if (ok) return <p role="status" className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{ok}</p>;
  return null;
}

/** The super admin side: everything the Afriheart team needs to run the app. */
export function AdminApp({ me, role, perms, initialTab }: { me: string; role: string; perms: Perm[]; initialTab?: string }) {
  const tabs = TABS.filter((t) => perms.includes(t.perm));
  const [tab, setTab] = useState<Tab>((tabs.find((t) => t.id === initialTab)?.id ?? tabs[0]?.id ?? "dashboard") as Tab);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  function go(t: Tab, person?: string) {
    setTab(t);
    if (person) setOpenPerson(person);
    history.replaceState(null, "", `/admin?tab=${t}`);
    window.scrollTo({ top: 0 });
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-24 pt-5 lg:flex-row" data-admin>
      <nav aria-label="Admin" className="lg:w-56 lg:shrink-0">
        <div className="mb-3 flex items-center justify-between lg:block">
          <h1 className="display text-2xl">Afriheart admin</h1>
          <p className="text-xs text-muted lg:mb-3">Signed in as {role}</p>
        </div>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col">
          {tabs.map((t) => (
            <li key={t.id} className="shrink-0">
              <button className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold ${tab === t.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-line/40"}`}
                aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>{t.label}</button>
            </li>
          ))}
          <li className="shrink-0"><Link href="/" className="flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:bg-line/40">Back to the app</Link></li>
        </ul>
      </nav>
      <section className="min-w-0 flex-1" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "dashboard" && <Dashboard go={go} />}
        {tab === "people" && <People perms={perms} me={me} open={openPerson} setOpen={setOpenPerson} goTicket={() => go("support")} />}
        {tab === "support" && <Support goPerson={(id) => go("people", id)} />}
        {tab === "safety" && <Safety />}
        {tab === "payments" && <Payments goPerson={(id) => go("people", id)} />}
        {tab === "announcements" && <Announcements />}
        {tab === "team" && <Team />}
        {tab === "activity" && <Activity />}
        {tab === "leads" && <Leads />}
      </section>
    </div>
  );
}

type Dash = {
  people: { total: number; new_today: number; new_7d: number; new_30d: number; active_today: number; active_7d: number; banned: number };
  dating: { profiles: number; verified: number; matches_7d: number; matches_total: number; dates_met: number };
  plus: { active: number; on_trial: number; revenue_30d_cents: number; revenue_total_cents: number; payments_30d: number };
  queues: { reports: number; urgent_reports: number; selfies: number; tickets_open: number; tickets_unread: number };
  signups: { day: string; count: number }[];
};

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" data-kpi={label}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="display text-3xl">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Dashboard({ go }: { go: (t: Tab) => void }) {
  const { data, error } = useLoad<Dash>("/api/admin/dashboard");
  if (error) return <Notice error={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const max = Math.max(1, ...data.signups.map((s) => s.count));
  return (
    <div className="flex flex-col gap-4" data-dashboard>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="People" value={data.people.total} sub={`${data.people.new_today} new today · ${data.people.new_7d} this week`} />
        <Tile label="Active" value={data.people.active_today} sub={`today · ${data.people.active_7d} this week`} />
        <Tile label="Matches" value={data.dating.matches_7d} sub={`this week · ${data.dating.matches_total} in total`} />
        <Tile label="Revenue" value={rand(data.plus.revenue_30d_cents)} sub={`last 30 days · ${data.plus.payments_30d} payments`} />
        <Tile label="Afriheart+" value={data.plus.active} sub={`active · ${data.plus.on_trial} on a free trial`} />
        <Tile label="Dating profiles" value={data.dating.profiles} sub={`${data.dating.verified} photo verified`} />
        <Tile label="Dates" value={data.dating.dates_met} sub="confirmed with We met" />
        <Tile label="Banned" value={data.people.banned} />
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">New people, last 14 days</h2>
        <div className="flex h-32 items-end gap-1" role="img" aria-label={`New people per day: ${data.signups.map((s) => `${s.day.slice(5)} ${s.count}`).join(", ")}`}>
          {data.signups.map((s) => (
            <div key={s.day} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted">{s.count || ""}</span>
              <span className="w-full rounded-t bg-accent" style={{ height: `${(s.count / max) * 100}%`, minHeight: s.count ? 4 : 1 }} />
              <span className="text-[10px] text-muted">{s.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <button className="card text-left" onClick={() => go("safety")}><p className="font-semibold">Reports to review</p><p className="display text-2xl">{data.queues.reports}</p>{data.queues.urgent_reports > 0 && <p className="text-sm font-semibold text-danger">{data.queues.urgent_reports} urgent (underage or safety)</p>}</button>
        <button className="card text-left" onClick={() => go("safety")}><p className="font-semibold">Selfies to check</p><p className="display text-2xl">{data.queues.selfies}</p></button>
        <button className="card text-left" onClick={() => go("support")}><p className="font-semibold">Open support tickets</p><p className="display text-2xl">{data.queues.tickets_open}</p>{data.queues.tickets_unread > 0 && <p className="text-sm font-semibold text-accent">{data.queues.tickets_unread} waiting for a reply</p>}</button>
      </div>
    </div>
  );
}

type PersonRow = { id: string; name: string; phone: string; created_at: string; last_seen_at: string | null; banned: boolean };
type PersonDetail = {
  id: string; name: string; phone: string; created_at: string; last_seen_at: string | null; banned: { at: string; reason: string } | null; staff_role: string | null;
  dating: { name: string; area: string; photos: string[]; verified: boolean; paused: boolean; removed: boolean; created_at: string } | null;
  plus: { until: string; trial: boolean } | null;
  payments: { id: string; pass: string; amount_cents: number; status: string; method: string | null; provider: string; created_at: string }[];
  reports_about: { id: string; reason: string; status: string; outcome: string | null; created_at: string }[];
  reports_made: number; devices: number; chats: number; verification: string | null;
  tickets: { id: string; subject: string; status: string; created_at: string }[];
};

function People({ perms, me, open, setOpen, goTicket }: { perms: Perm[]; me: string; open: string | null; setOpen: (id: string | null) => void; goTicket: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PersonRow[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => apiGet<PersonRow[]>(`/api/admin/people?q=${encodeURIComponent(q)}`).then(setList).catch(() => setList([])), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);
  if (open) return <Person id={open} perms={perms} me={me} onBack={() => setOpen(null)} goTicket={goTicket} />;
  return (
    <div className="flex flex-col gap-3">
      <label className="relative">
        <span className="sr-only">Search people by name or number</span>
        <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" className="field pl-10" placeholder="Name or mobile number" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className="card flex flex-col p-0" data-people>
        {!list && <li className="p-4 text-sm text-muted">Loading…</li>}
        {list?.length === 0 && <li className="p-4 text-sm text-muted">Nobody found.</li>}
        {list?.map((p) => (
          <li key={p.id}>
            <button className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line/70 px-4 py-2 text-left last:border-0 hover:bg-line/20" onClick={() => setOpen(p.id)}>
              <span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="block text-xs text-muted">{p.phone.includes("•") ? p.phone : formatPhone(p.phone)} · joined {dayLabel(p.created_at)}</span></span>
              <span className="shrink-0 text-xs text-muted">{p.banned ? <span className="font-semibold text-danger">Banned</span> : `seen ${when(p.last_seen_at)}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Person({ id, perms, me, onBack, goTicket }: { id: string; perms: Perm[]; me: string; onBack: () => void; goTicket: () => void }) {
  const { data, error, reload } = useLoad<PersonDetail>(`/api/admin/people/${id}`);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [confirmName, setConfirmName] = useState("");
  async function act(body: Record<string, unknown>, ok: string) {
    setMsg({});
    try {
      await apiSend(`/api/admin/people/${id}`, "POST", body);
      setMsg({ ok });
      reload();
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
  }
  if (error) return <Notice error={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const can = (p: Perm) => perms.includes(p);
  return (
    <div className="flex flex-col gap-3" data-person={data.id}>
      <button className="self-start text-sm font-semibold text-accent underline" onClick={onBack}>← All people</button>
      <Notice error={msg.error} ok={msg.ok} />
      <div className="card flex flex-wrap items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {data.dating?.photos[0] && <img src={`/api/dating/photos/${data.dating.photos[0]}?size=small`} alt={`${data.name}'s photo`} className="h-24 w-24 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <h2 className="display text-2xl">{data.name}</h2>
          <p className="text-sm">{data.phone.includes("•") ? data.phone : formatPhone(data.phone)}</p>
          <p className="text-xs text-muted">Joined {when(data.created_at)} · last seen {when(data.last_seen_at)} · {data.devices} phones · {data.chats} chats</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {data.banned && <span className="status bg-warm-soft text-warm-ink">Banned: {data.banned.reason}</span>}
            {data.staff_role && <span className="status status-done">Staff: {data.staff_role}</span>}
            {data.plus && <span className="status status-done">Afriheart+ until {dayLabel(data.plus.until)}{data.plus.trial ? " (free trial)" : ""}</span>}
            {data.dating?.verified && <span className="status status-done">Photo verified</span>}
            {data.dating?.removed && <span className="status bg-warm-soft text-warm-ink">Removed from dating</span>}
            {data.dating?.paused && <span className="status">Paused</span>}
          </div>
        </div>
      </div>
      {data.dating && (
        <div className="card text-sm">
          <h3 className="mb-1 font-semibold">Dating profile</h3>
          <p>{data.dating.name} · {data.dating.area} · since {dayLabel(data.dating.created_at)} · selfie check: {data.verification ?? "not done"}</p>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {data.dating.photos.map((p, i) => <img key={p} src={`/api/dating/photos/${p}?size=small`} alt={`Photo ${i + 1}`} className="h-28 w-20 shrink-0 rounded-lg object-cover" />)}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card text-sm">
          <h3 className="mb-1 font-semibold">Reports about them ({data.reports_about.length})</h3>
          {data.reports_about.length === 0 ? <p className="text-muted">None.</p> : (
            <ul>{data.reports_about.map((r) => <li key={r.id}>{dayLabel(r.created_at)}: {r.reason} · {r.status}{r.outcome ? ` (${r.outcome})` : ""}</li>)}</ul>
          )}
          <p className="mt-1 text-xs text-muted">They&apos;ve reported {data.reports_made} people.</p>
        </div>
        <div className="card text-sm">
          <h3 className="mb-1 font-semibold">Support tickets</h3>
          {data.tickets.length === 0 ? <p className="text-muted">None.</p> : <ul>{data.tickets.map((t) => <li key={t.id}><button className="text-left underline" onClick={goTicket}>{t.subject}</button> · {t.status}</li>)}</ul>}
        </div>
      </div>
      {can("payments") && (
        <div className="card text-sm">
          <h3 className="mb-1 font-semibold">Payments</h3>
          {data.payments.length === 0 ? <p className="text-muted">None.</p> : (
            <ul>{data.payments.map((p) => <li key={p.id}>{dayLabel(p.created_at)} · {p.pass} · {rand(p.amount_cents)} · {p.status}{p.method ? ` · ${p.method}` : ""}</li>)}</ul>
          )}
        </div>
      )}
      {data.id !== me && (
        <div className="card flex flex-col gap-4" data-person-actions>
          <h3 className="font-semibold">Actions</h3>
          {can("ban") && (data.banned ? (
            <button className="btn btn-ghost self-start" onClick={() => act({ action: "unban" }, "Unbanned. They can sign in again.")}>Unban</button>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (confirm(`Ban ${data.name}? They'll be signed out everywhere and can't sign in.`)) act({ action: "ban", reason }, "Banned and signed out everywhere."); }}>
              <label className="text-sm font-semibold" htmlFor="ban-reason">Ban from Afriheart</label>
              <input id="ban-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (only the team sees this)" maxLength={300} />
              <button className="btn self-start bg-danger" disabled={reason.trim().length < 3}>Ban</button>
            </form>
          ))}
          {can("safety") && data.dating && (
            <button className="btn btn-ghost self-start" onClick={() => act({ action: data.dating!.removed ? "restore_dating" : "remove_dating" }, data.dating!.removed ? "Back in dating." : "Removed from dating. Their matches have ended.")}>
              {data.dating.removed ? "Bring back to dating" : "Remove from dating only"}
            </button>
          )}
          {can("grant_plus") && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act({ action: "grant_plus", days: Number(days), note }, `Added ${days} days of Afriheart+.`); }}>
              <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Give Afriheart+</span>
                <select className="field py-2" value={days} onChange={(e) => setDays(e.target.value)}>{["7", "30", "90", "365"].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
              </label>
              <input className="field flex-1 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (e.g. sorry for the payment problem)" aria-label="Reason for the gift" maxLength={200} />
              <button className="btn btn-sm">Give</button>
            </form>
          )}
          {can("delete_account") && (
            <form className="flex flex-col gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); act({ action: "delete", confirm: confirmName }, "Account deleted."); }}>
              <label className="text-sm font-semibold text-danger" htmlFor="del-confirm">Delete their account (can&apos;t be undone)</label>
              <input id="del-confirm" className="field" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Type ${data.name} to confirm`} />
              <button className="btn self-start bg-danger" disabled={confirmName.trim() !== data.name}>Delete account</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

type Ticket = { id: string; subject: string; category: string; status: string; priority: string; unread: boolean; contact: string; signed_in: boolean; assignee: string | null; updated_at: string };
type Thread = Parameters<typeof TicketThread>[0]["initial"] & { ticket: { person_id: string | null; contact_name: string; contact_phone: string; contact_email: string | null; device_info: string | null; priority: string; status: string } };

function Support({ goPerson }: { goPerson: (id: string) => void }) {
  const [filter, setFilter] = useState("open");
  const { data, reload } = useLoad<Ticket[]>(`/api/admin/support?filter=${filter}`);
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <TicketAdmin id={open} onBack={() => { setOpen(null); reload(); }} goPerson={goPerson} />;
  return (
    <div className="flex flex-col gap-3" data-support-inbox>
      <div role="tablist" aria-label="Tickets" className="flex gap-1">
        {[["open", "Open"], ["mine", "Mine"], ["resolved", "Solved"]].map(([v, l]) => (
          <button key={v} role="tab" aria-selected={filter === v} className={`chip min-h-9 ${filter === v ? "border-accent bg-accent-soft font-semibold text-accent" : ""}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <ul className="card flex flex-col p-0">
        {!data && <li className="p-4 text-sm text-muted">Loading…</li>}
        {data?.length === 0 && <li className="p-4 text-sm text-muted">Nothing here. 🎉</li>}
        {data?.map((t) => (
          <li key={t.id}>
            <button className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line/70 px-4 py-2 text-left last:border-0 hover:bg-line/20" onClick={() => setOpen(t.id)}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">{t.priority === "urgent" && <span className="status bg-warm-soft text-warm-ink">Urgent</span>}<span className="truncate">{t.subject}</span></span>
                <span className="block text-xs text-muted">{t.contact}{t.signed_in ? "" : " (couldn't sign in)"} · {t.category} · {when(t.updated_at)}</span>
              </span>
              {t.unread && <span className="status status-done shrink-0">New</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketAdmin({ id, onBack, goPerson }: { id: string; onBack: () => void; goPerson: (id: string) => void }) {
  const { data, reload } = useLoad<Thread>(`/api/admin/support/${id}`);
  const [msg, setMsg] = useState<string | null>(null);
  async function set(body: Record<string, unknown>, ok: string) {
    try { await apiSend(`/api/admin/support/${id}`, "POST", body); setMsg(ok); reload(); } catch (e) { setMsg((e as Error).message); }
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const t = data.ticket;
  return (
    <div className="flex flex-col gap-3" data-ticket-admin>
      <button className="self-start text-sm font-semibold text-accent underline" onClick={onBack}>← All tickets</button>
      {msg && <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{msg}</p>}
      <div className="card flex flex-col gap-1 text-sm">
        <h2 className="display text-xl">{t.subject}</h2>
        <p>{t.category_label} · {t.status} · {t.priority}</p>
        <p><strong>{t.contact_name}</strong> · {formatPhone(t.contact_phone)}{t.contact_email ? ` · ${t.contact_email}` : ""}</p>
        {!t.person_id && <p className="text-muted">Sent from the sign-in screen: reply by SMS or WhatsApp to their number, and note it here.</p>}
        {t.device_info && <details><summary className="cursor-pointer text-muted">Phone details</summary><pre className="whitespace-pre-wrap break-all text-xs">{t.device_info}</pre></details>}
        <div className="mt-2 flex flex-wrap gap-2">
          {t.person_id && <button className="btn btn-ghost btn-sm" onClick={() => goPerson(t.person_id!)}>Open their account</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => set({ assign: "me" }, "Assigned to you.")}>Assign to me</button>
          <button className="btn btn-ghost btn-sm" onClick={() => set({ priority: t.priority === "urgent" ? "normal" : "urgent" }, "Priority changed.")}>{t.priority === "urgent" ? "Not urgent" : "Mark urgent"}</button>
          {t.status === "resolved"
            ? <button className="btn btn-ghost btn-sm" onClick={() => set({ status: "open" }, "Opened again.")}>Open again</button>
            : <button className="btn btn-sm" onClick={() => set({ status: "resolved" }, "Marked solved.")}>Mark solved</button>}
        </div>
      </div>
      <TicketThread key={data.messages.length} id={id} initial={data} team />
    </div>
  );
}

function Safety() {
  const { data } = useLoad<Dash>("/api/admin/dashboard");
  return (
    <div className="card flex flex-col gap-2" data-safety>
      <h2 className="font-semibold">Reports and selfie checks</h2>
      {data && <p className="text-sm">{data.queues.reports} reports open ({data.queues.urgent_reports} urgent) · {data.queues.selfies} selfies to check</p>}
      <p className="text-sm text-muted">Underage and safety reports come first. Removing someone from dating ends their matches; banning also signs them out everywhere (People tab).</p>
      <Link href="/team" className="btn self-start">Open the safety queue</Link>
    </div>
  );
}

type Payment = { id: string; person_id: string; person_name: string; pass: string; amount_cents: number; status: string; provider: string; method: string | null; provider_ref: string | null; created_at: string };
function Payments({ goPerson }: { goPerson: (id: string) => void }) {
  const { data, error, reload } = useLoad<Payment[]>("/api/admin/payments");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  if (error) return <Notice error={error} />;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-3" data-payments>
      <Notice error={msg.error} ok={msg.ok} />
      <p className="text-sm text-muted">To refund, refund the money in the Payfast dashboard first (Transactions → the payment → Refund), then press Refunded here: it takes the days off their Afriheart+.</p>
      <div className="card overflow-x-auto p-0" tabIndex={0} role="region" aria-label="Payments">
        <table className="w-full text-left text-sm">
          <thead className="text-sm font-medium text-muted"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Pass</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">How</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="border-t border-line/70">
                <td className="p-3 whitespace-nowrap">{when(p.created_at)}</td>
                <td className="p-3"><button className="underline" onClick={() => p.person_id && goPerson(p.person_id)}>{p.person_name}</button></td>
                <td className="p-3">{p.pass}</td>
                <td className="p-3">{rand(p.amount_cents)}</td>
                <td className="p-3">{p.status}</td>
                <td className="p-3">{p.method ?? p.provider}</td>
                <td className="p-3">{p.status === "complete" && p.provider !== "gift" && (
                  <button className="text-sm font-semibold underline" onClick={async () => {
                    const note = prompt("Refunded in Payfast? Add a note (e.g. the Payfast refund number):") ?? "";
                    if (!note) return;
                    try { await apiSend(`/api/admin/payments/${p.id}`, "POST", { note }); setMsg({ ok: "Marked refunded." }); reload(); } catch (e) { setMsg({ error: (e as Error).message }); }
                  }}>Refunded</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="p-4 text-sm text-muted">No payments yet.</p>}
      </div>
    </div>
  );
}

type Ann = { id: string; text: string; kind: string; active: boolean; created_at: string; ends_at: string | null };
function Announcements() {
  const { data, reload } = useLoad<Ann[]>("/api/admin/announcements");
  const [text, setText] = useState("");
  const [kind, setKind] = useState("info");
  const [hours, setHours] = useState("24");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  return (
    <div className="flex flex-col gap-3" data-announcements>
      <Notice error={msg.error} ok={msg.ok} />
      <form className="card flex flex-col gap-2" onSubmit={async (e) => {
        e.preventDefault();
        try { await apiSend("/api/admin/announcements", "POST", { text, kind, hours: hours === "0" ? null : Number(hours) }); setText(""); setMsg({ ok: "Everyone sees it now, at the top of the app." }); reload(); } catch (err) { setMsg({ error: (err as Error).message }); }
      }}>
        <h2 className="font-semibold">Show a banner to everyone</h2>
        <label className="sr-only" htmlFor="ann-text">Announcement</label>
        <textarea id="ann-text" className="field min-h-20" maxLength={240} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Calls may drop tonight between 22:00 and 23:00 while we upgrade. Sorry!" />
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">Type <select className="field py-2" value={kind} onChange={(e) => setKind(e.target.value)}><option value="info">News</option><option value="warning">Problem or maintenance</option></select></label>
          <label className="flex items-center gap-2 text-sm">Show for <select className="field py-2" value={hours} onChange={(e) => setHours(e.target.value)}><option value="2">2 hours</option><option value="24">1 day</option><option value="168">1 week</option><option value="0">Until I end it</option></select></label>
        </div>
        <button className="btn self-start" disabled={text.trim().length < 5}>Show banner</button>
      </form>
      <ul className="card flex flex-col p-0">
        {data?.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 last:border-0 text-sm">
            <span><span className="font-semibold">{a.active ? "Showing" : "Ended"}</span> · {a.text} <span className="text-xs text-muted">({when(a.created_at)})</span></span>
            {a.active && <button className="shrink-0 font-semibold underline" onClick={async () => { await apiSend(`/api/admin/announcements/${a.id}`, "DELETE"); reload(); }}>End</button>}
          </li>
        ))}
        {data?.length === 0 && <li className="p-4 text-sm text-muted">No announcements yet.</li>}
      </ul>
    </div>
  );
}

type StaffRow = { id: string; name: string; phone: string; role: string; fixed: boolean };
const ROLES: [string, string, string][] = [
  ["support", "Support", "Answers support tickets and looks people up (numbers partly hidden)."],
  ["moderator", "Moderator", "Support, plus reports, selfie checks, banning and removing from dating."],
  ["super_admin", "Super admin", "Everything: payments, gifts of Afriheart+, deleting accounts, announcements, the team and the log."],
];
function Team() {
  const { data, reload } = useLoad<StaffRow[]>("/api/admin/staff");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("support");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  async function save(p: string, r: string | null, ok: string) {
    setMsg({});
    try { await apiSend("/api/admin/staff", "POST", { phone: p, role: r }); setMsg({ ok }); reload(); } catch (e) { setMsg({ error: (e as Error).message }); }
  }
  return (
    <div className="flex flex-col gap-3" data-team>
      <Notice error={msg.error} ok={msg.ok} />
      <div className="card text-sm">
        <h2 className="mb-2 font-semibold">Roles</h2>
        <ul className="flex flex-col gap-1">{ROLES.map(([, l, d]) => <li key={l}><strong>{l}:</strong> {d}</li>)}</ul>
        <p className="mt-2 text-xs text-muted">Nobody on the team can read people&apos;s chats: they&apos;re end-to-end encrypted.</p>
      </div>
      <form className="card flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(phone, role, "Added to the team."); setPhone(""); }}>
        <label className="flex flex-1 flex-col gap-1 text-sm"><span className="font-semibold">Add someone (they must have signed in once)</span><input className="field py-2" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 123 4567" /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Role</span><select className="field py-2" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="btn btn-sm" disabled={!phone.trim()}>Add</button>
      </form>
      <ul className="card flex flex-col p-0">
        {data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3 last:border-0">
            <span><span className="font-semibold">{s.name}</span> <span className="text-xs text-muted">{formatPhone(s.phone)}</span></span>
            {s.fixed ? <span className="text-xs text-muted">{ROLES.find((r) => r[0] === s.role)?.[1]} (set in the server settings)</span> : (
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`role-${s.id}`}>Role for {s.name}</label>
                <select id={`role-${s.id}`} className="field py-1.5 text-sm" value={s.role} onChange={(e) => save(s.phone, e.target.value, "Role changed.")}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button className="text-sm font-semibold text-danger underline" onClick={() => confirm(`Remove ${s.name} from the team?`) && save(s.phone, null, "Removed from the team.")}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AuditRow = { id: string; actor: string; action: string; target: string | null; target_type: string; details: string; created_at: string };
function Activity() {
  const { data } = useLoad<AuditRow[]>("/api/admin/audit");
  return (
    <div className="card overflow-x-auto p-0" data-activity tabIndex={0} role="region" aria-label="Activity log">
      <table className="w-full text-left text-sm">
        <thead className="text-sm font-medium text-muted"><tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">Did</th><th className="p-3">To</th><th className="p-3">Details</th></tr></thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r.id} className="border-t border-line/70"><td className="p-3 whitespace-nowrap">{when(r.created_at)}</td><td className="p-3">{r.actor}</td><td className="p-3">{r.action.replaceAll("_", " ")}</td><td className="p-3">{r.target_type === "person" ? r.target : r.target_type}</td><td className="p-3">{r.details}</td></tr>
          ))}
        </tbody>
      </table>
      {data?.length === 0 && <p className="p-4 text-sm text-muted">Nothing yet.</p>}
    </div>
  );
}

type LeadsData = { venues: { id: string; venue: string; city: string; contact: string; created_at: string }[]; interest: { area: string; count: number }[] };
function Leads() {
  const { data } = useLoad<LeadsData>("/api/admin/leads");
  return (
    <div className="grid gap-3 md:grid-cols-2" data-leads>
      <div className="card text-sm">
        <h2 className="mb-2 font-semibold">Venues that want to join</h2>
        {data?.venues.length === 0 && <p className="text-muted">None yet.</p>}
        <ul>{data?.venues.map((v) => <li key={v.id} className="border-b border-line/70 py-2 last:border-0"><strong>{v.venue}</strong> · {v.city}<br /><span className="text-muted">{v.contact} · {dayLabel(v.created_at)}</span></li>)}</ul>
      </div>
      <div className="card text-sm">
        <h2 className="mb-2 font-semibold">People waiting for date deals</h2>
        {data?.interest.length === 0 && <p className="text-muted">None yet.</p>}
        <ul>{data?.interest.map((i) => <li key={i.area} className="flex justify-between border-b border-line/70 py-2 last:border-0"><span>{i.area}</span><strong>{i.count}</strong></li>)}</ul>
      </div>
    </div>
  );
}
