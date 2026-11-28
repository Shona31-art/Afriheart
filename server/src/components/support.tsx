"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { HELP, HELP_CATEGORIES, searchHelp, type HelpArticle } from "@/lib/help";
import { apiGet, apiSend, clock, dayLabel } from "@/lib/client";
import { dataLightOn } from "@/lib/data-light";
import { IconBack, IconSearch } from "./icons";
import { shrink } from "./composer";

const CATEGORIES: [string, string][] = [
  ["sign_in", "Signing in"], ["chats_calls", "Chats and calls"], ["dating", "Dating"], ["safety", "Safety (goes first)"],
  ["payments", "Membership and payments"], ["account", "My account and data"], ["bug", "Something isn't working"], ["other", "Something else"],
];
const STATUS: Record<string, string> = { open: "Waiting for the team", waiting: "The team replied", resolved: "Solved" };
type Ticket = { id: string; subject: string; status: string; unread: boolean; updated_at: string };

function Article({ a, open = false }: { a: HelpArticle; open?: boolean }) {
  return (
    <details className="group border-b border-line/70 py-1 last:border-0" open={open} data-help-article={a.id}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
        {a.q}<span aria-hidden className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="flex flex-col gap-2 pb-3 text-[15px]">{a.a.map((p, i) => <p key={i}>{p}</p>)}</div>
    </details>
  );
}

/** Help centre, contact form and "My tickets". Signed out, it still works for sign-in problems. */
export function SupportCentre({ signedIn, initialCategory }: { signedIn: boolean; initialCategory?: string }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchHelp(q), [q]);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  useEffect(() => { if (signedIn) apiGet<Ticket[]>("/api/support").then(setTickets).catch(() => setTickets([])); }, [signedIn]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <Link href={signedIn ? "/you" : "/signin"} className="icon-btn -ml-3" aria-label="Back"><IconBack /></Link>
        <h1 className="display text-3xl">Help and support</h1>
      </div>

      <div role="note" className="rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">
        <strong>In danger right now?</strong> Call <a href="tel:10111" className="font-semibold underline">10111</a> (SAPS) or <a href="tel:112" className="font-semibold underline">112</a> from a mobile. Then tell us below and choose Safety.
      </div>

      {signedIn && tickets && tickets.length > 0 && (
        <section aria-labelledby="sec-tickets" className="card" data-my-tickets>
          <h2 id="sec-tickets" className="mb-2 font-semibold">My tickets</h2>
          <ul className="flex flex-col">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex min-h-12 items-center justify-between gap-3 border-b border-line/70 py-2 last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.subject}</span>
                    <span className="block text-xs text-muted">{STATUS[t.status]} · {dayLabel(t.updated_at)}</span>
                  </span>
                  {t.unread && <span className="status status-done shrink-0">New reply</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sec-help" className="flex flex-col gap-3">
        <h2 id="sec-help" className="font-semibold">Find an answer</h2>
        <label className="relative">
          <span className="sr-only">Search help</span>
          <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" className="field pl-10" placeholder="e.g. didn't get my code, refund, notifications" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {q.trim().length > 1 ? (
          <div className="card" data-help-results>
            {results.length ? results.map((a) => <Article key={a.id} a={a} />) : <p className="text-sm text-muted">No answers for that. Ask us below and a person will help.</p>}
          </div>
        ) : (
          HELP_CATEGORIES.map((c) => (
            <div key={c.id} className="card">
              <h3 className="display mb-1 text-xl text-ink">{c.label}</h3>
              {HELP.filter((a) => a.category === c.id).map((a) => <Article key={a.id} a={a} />)}
            </div>
          ))
        )}
      </section>

      <ContactForm signedIn={signedIn} initialCategory={initialCategory} onSent={(id) => setTickets((t) => [{ id, subject: "Sent", status: "open", unread: false, updated_at: new Date().toISOString() }, ...(t ?? [])])} />
    </div>
  );
}

const noSubscribe = () => () => {};
let deviceCache: string | null = null;
const cachedDeviceInfo = () => (deviceCache ??= deviceInfo());

function deviceInfo() {
  if (typeof navigator === "undefined") return "";
  const parts = [
    `Browser: ${navigator.userAgent.slice(0, 200)}`,
    `Screen: ${screen.width}×${screen.height}`,
    `Online: ${navigator.onLine ? "yes" : "no"}`,
    `Data-light: ${dataLightOn() ? "on" : "off"}`,
    `App: ${"AfriheartAndroid" in window ? "Android app" : "browser"}`,
    `Time: ${new Date().toISOString()}`,
  ];
  return parts.join("\n");
}

function ContactForm({ signedIn, initialCategory, onSent }: { signedIn: boolean; initialCategory?: string; onSent: (id: string) => void }) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory && CATEGORIES.some(([c]) => c === initialCategory) ? initialCategory : signedIn ? "bug" : "sign_in");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [includeDevice, setIncludeDevice] = useState(true);
  const [shot, setShot] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const info = useSyncExternalStore(noSubscribe, cachedDeviceInfo, () => "");

  if (sent) {
    return (
      <section className="card flex flex-col gap-2" role="status" data-support-sent>
        <h2 className="font-semibold">Thanks, we&apos;ve got it</h2>
        <p className="text-sm">A person on the Afriheart team will reply{signedIn ? " here, under My tickets, and you'll get a notification" : " by SMS or WhatsApp to the number you gave, or in the app once you can sign in"}. Safety requests are answered first.</p>
        {signedIn && <Link href={`/support/${sent}`} className="btn btn-sm self-start">Open my ticket</Link>}
      </section>
    );
  }

  return (
    <section aria-labelledby="sec-contact" className="card flex flex-col gap-3" data-contact-support>
      <h2 id="sec-contact" className="font-semibold">Contact support</h2>
      <p className="text-sm text-muted">A person reads every request. We usually reply within a day; safety requests sooner.</p>
      {error && <p role="alert" className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await apiSend<{ id: string }>("/api/support", "POST", {
            category, body, include_device: includeDevice, device_info: info,
            ...(signedIn ? { attachment: shot?.path } : { name, phone, email }),
          });
          setSent(r.id);
          onSent(r.id);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">What&apos;s it about?</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {!signedIn && (
          <>
            <label className="flex flex-col gap-1"><span className="text-sm font-semibold">Your name</span><input className="field" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label className="flex flex-col gap-1"><span className="text-sm font-semibold">The mobile number you use for Afriheart</span><input className="field" required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="082 123 4567" /></label>
            <label className="flex flex-col gap-1"><span className="text-sm font-semibold">Email (optional)</span><input className="field" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          </>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">What happened?</span>
          <textarea className="field min-h-32" required minLength={10} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="What you were doing, what you expected, and what happened instead." />
        </label>
        {signedIn && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Screenshot (optional)</span>
            {shot ? (
              <span className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.url} alt="Your screenshot" className="h-20 w-20 rounded-lg object-cover" />
                <button type="button" className="text-sm font-semibold underline" onClick={() => setShot(null)}>Remove</button>
              </span>
            ) : (
              <label className="btn btn-ghost btn-sm w-fit cursor-pointer">
                Add a screenshot
                <input type="file" accept="image/*" className="sr-only" data-support-shot onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    const blob = await shrink(f);
                    const form = new FormData();
                    form.set("file", new File([blob], "screenshot.jpg", { type: "image/jpeg" }));
                    const r = await apiSend<{ path: string }>("/api/support/attachments", "POST", form);
                    setShot({ path: r.path, url: URL.createObjectURL(blob) });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }} />
              </label>
            )}
            <span className="text-xs text-muted">The support team can see screenshots, so don&apos;t include anything you don&apos;t want them to see. Never send your bank details.</span>
          </div>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--accent)]" checked={includeDevice} onChange={(e) => setIncludeDevice(e.target.checked)} />
          <span>Include details about my phone and browser, to help find the problem
            <details className="text-xs text-muted"><summary className="cursor-pointer">What&apos;s included</summary><pre className="whitespace-pre-wrap break-all font-mono">{info}</pre></details>
          </span>
        </label>
        <button className="btn" disabled={busy || body.trim().length < 10}>{busy ? "Sending…" : "Send to support"}</button>
      </form>
    </section>
  );
}

type Thread = { ticket: { id: string; subject: string; status: string; category_label: string; created_at: string }; messages: { id: string; from_team: boolean; body: string; author: string; attachment: string | null; created_at: string }[] };

/** One ticket: the conversation with the team, and a reply box. */
export function TicketThread({ id, initial, team = false }: { id: string; initial: Thread; team?: boolean }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = team ? `/api/admin/support/${id}` : `/api/support/${id}`;
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiSend(base, "POST", { body: text });
      setText("");
      setData(await apiGet<Thread>(base));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3" data-ticket-thread>
      <ul className="flex flex-col gap-2">
        {data.messages.map((m) => {
          const mine = team ? m.from_team : !m.from_team;
          return (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[15px] ${mine ? "bg-accent-soft" : "bg-card shadow-sm"}`} data-from-team={m.from_team || undefined}>
                <p className="mb-0.5 text-xs font-semibold text-accent">{m.author}</p>
                {m.body}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.attachment && <a href={`/api/media/${m.attachment}`} target="_blank" rel="noreferrer" className="mt-2 block"><img src={`/api/media/${m.attachment}`} alt="Screenshot" className="max-h-60 rounded-lg" /></a>}
              </div>
              <span className="mt-0.5 text-[11px] text-muted">{dayLabel(m.created_at)} {clock(m.created_at)}</span>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="ticket-reply">{team ? "Reply to them" : "Reply to support"}</label>
        <textarea id="ticket-reply" className="field min-h-24" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={team ? "Write your reply…" : data.ticket.status === "resolved" ? "Still a problem? Reply to open it again." : "Add more details or reply…"} />
        <button className="btn self-end" disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : team ? "Send reply" : "Send"}</button>
      </div>
    </div>
  );
}
