"use client";

import { photoSrc, useDataLight } from "@/lib/data-light";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import type { DuoCard, DuoStatus } from "@/lib/double";
import { IconClose, IconHeart, IconShield, IconSparkle, IconUser } from "./icons";

const IDEAS = ["Bowling, then burgers", "Karaoke night", "Braai and board games", "Escape room, then drinks", "Picnic at the beach"];

/** The Double date tab in Discover: pair up with a friend, then match with other pairs. */
export function DoubleDiscover() {
  const { on: light } = useDataLight();
  const router = useRouter();
  const [status, setStatus] = useState<DuoStatus | null>(null);
  const [cards, setCards] = useState<DuoCard[] | null>(null);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ chat_id: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiGet<DuoStatus>("/api/dating/duo");
      setStatus(s);
      if (s.duo?.status === "active") setCards(await apiGet<DuoCard[]>("/api/dating/duo/discover"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Load this person's pair (and pairs to see) when the tab opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (status?.duo?.status !== "pending") return;
    const t = setInterval(load, 6000); // shows when the friend accepts
    return () => clearInterval(t);
  }, [status?.duo?.status, load]);

  async function act<T>(fn: () => Promise<T>, done?: (v: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const v = await fn();
      done?.(v);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = cards?.[0];

  if (!status) return <div className="flex-1 animate-pulse rounded-3xl bg-line/60" aria-busy="true" aria-label="Loading double dates" />;

  if (!status.duo) {
    return (
      <section className="card flex flex-col gap-3" aria-labelledby="dd-title">
        <h2 id="dd-title" className="display text-2xl">Double date with a friend</h2>
        <p className="text-sm text-muted">Pair up with a friend and match with another pair. It&apos;s more relaxed than a one-on-one, and you plan the date together in a chat for four.</p>
        {error && <p role="alert" className="rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); act(() => apiSend<DuoStatus>("/api/dating/duo", "POST", { idea }), setStatus); }}>
          <label htmlFor="dd-idea" className="text-sm font-semibold">A date for four</label>
          <input id="dd-idea" className="field" value={idea} maxLength={120} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. Bowling, then burgers" required />
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((i) => <button key={i} type="button" className={`chip min-h-11 ${idea === i ? "chip-on" : ""}`} onClick={() => setIdea(i)}>{i}</button>)}
          </div>
          <button className="btn" disabled={busy || idea.trim().length < 4}>{busy ? "Starting…" : "Invite a friend"}</button>
        </form>
      </section>
    );
  }

  if (status.duo.status === "pending") {
    const url = `${window.location.origin}/dating/double/${status.duo.code}`;
    const text = `Double date with me on Afriheart? "${status.duo.idea}". Join my pair: ${url}`;
    return (
      <section className="card flex flex-col gap-3" aria-labelledby="dd-wait">
        <h2 id="dd-wait" className="display text-2xl">Send this to your friend</h2>
        <p className="text-sm text-muted">When they join, you&apos;ll see other pairs to double date with. They need a dating profile too.</p>
        <p className="break-all rounded-xl border border-line px-3 py-2 text-sm" data-duo-link={url}>{url}</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
          <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => undefined)}>{copied ? "Link copied" : "Copy link"}</button>
        </div>
        <p role="status" className="text-sm text-muted">Waiting for your friend to join…</p>
        <button className="self-start text-sm font-semibold text-danger underline" disabled={busy} onClick={() => act(() => apiSend<DuoStatus>("/api/dating/duo", "DELETE"), setStatus)}>Cancel the invite</button>
      </section>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
        <span>You&apos;re pairing with <strong>{status.partner?.name}</strong>: &ldquo;{status.duo.idea}&rdquo;</span>
        <button className="shrink-0 font-semibold text-accent underline" disabled={busy}
          onClick={() => confirm("Leave this pair? Your double-date chats stay.") && act(() => apiSend<DuoStatus>("/api/dating/duo", "DELETE"), (s) => { setStatus(s); setCards(null); })}>Leave pair</button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
      {!cards && <div className="flex-1 animate-pulse rounded-3xl bg-line/60" aria-busy="true" aria-label="Loading pairs" />}
      {cards && !current && (
        <div className="card flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <IconUser size={40} className="text-accent" />
          <p className="display text-2xl">No more pairs for now</p>
          <p className="max-w-xs text-sm text-muted">New pairs join all the time. Tell your friends to pair up too.</p>
          <button className="btn btn-sm" onClick={load}>Check again</button>
        </div>
      )}
      {current && (
        <article aria-label={`Pair: ${current.people.map((p) => `${p.name}, ${p.age}`).join(" and ")}`} className="flex flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-md" data-duo-card>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-0.5 bg-line">
            {current.people.map((p) => (
              <figure key={p.id} className="relative min-h-60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(p.photo, light)} alt={`${p.name}, ${p.age}`} className="absolute inset-0 h-full w-full object-cover" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-10 text-white">
                  <span className="display flex items-center gap-1 text-xl">{p.name}, {p.age}
                    {p.verified && <><IconShield size={18} className="text-[#7fd1ff]" aria-hidden /><span className="sr-only">, photo verified</span></>}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="px-4 py-3">
            <div className="rounded-2xl border border-accent/40 bg-accent-soft/60 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-accent"><IconSparkle size={14} /> Their date for four</p>
              <p className="font-semibold">{current.idea}</p>
            </div>
          </div>
        </article>
      )}
      {current && (
        <div className="flex items-center justify-center gap-5">
          <button disabled={busy} aria-label={`Pass on ${current.people.map((p) => p.name).join(" and ")}`}
            onClick={() => act(() => apiSend("/api/dating/duo/swipe", "POST", { to: current.id, action: "pass" }), () => setCards((c) => c?.slice(1) ?? []))}
            className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-card text-danger shadow-sm"><IconClose size={30} /></button>
          <button disabled={busy} aria-label={`Like ${current.people.map((p) => p.name).join(" and ")}`}
            onClick={() => act(() => apiSend<{ match: { chat_id: string; title: string } | null }>("/api/dating/duo/swipe", "POST", { to: current.id, action: "like" }), (r) => { setCards((c) => c?.slice(1) ?? []); if (r.match) setMatch(r.match); })}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm"><IconHeart size={30} /></button>
        </div>
      )}
      <p className="text-center text-xs text-muted">One like from either of you counts for your pair.</p>
      {match && (
        <div role="dialog" aria-modal="true" aria-labelledby="dd-match" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-brand px-8 text-center text-white">
          <IconHeart size={56} />
          <h2 id="dd-match" className="display text-4xl">It&apos;s a double date!</h2>
          <p className="text-white/90">Both pairs liked each other. Your chat for four has a plan to pick a time, and phone numbers stay hidden.</p>
          <button className="btn w-full max-w-xs bg-white text-brand" autoFocus onClick={() => router.push(`/chats/${match.chat_id}`)}>Open the chat</button>
          <button className="min-h-11 font-semibold underline" onClick={() => setMatch(null)}>Keep looking</button>
        </div>
      )}
    </div>
  );
}

/** /dating/double/<code>: a friend's invite to pair up. */
export function JoinDuo({ code, invite }: { code: string; invite: { name: string; idea: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="page">
      <h1 className="display mb-3 text-3xl">Double date</h1>
      {!invite ? (
        <section className="card flex flex-col gap-3">
          <p>This invite has expired or was already used.</p>
          <Link href="/discover" className="btn self-start">Go to Discover</Link>
        </section>
      ) : (
        <section className="card flex flex-col gap-3" aria-labelledby="dd-invite">
          <h2 id="dd-invite" className="text-xl font-semibold">{invite.name} wants to double date with you</h2>
          <p className="text-sm text-muted">You&apos;ll be a pair on Afriheart: other pairs see both of you, and when you match, you plan the date in a chat for four.</p>
          <p className="rounded-xl bg-accent-soft/60 px-3 py-2"><strong>The date:</strong> {invite.idea}</p>
          {error && <p role="alert" className="rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
          <div className="flex gap-2">
            <button className="btn" disabled={busy} onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await apiSend("/api/dating/duo/join", "POST", { code });
                router.push("/discover?mode=double");
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}>{busy ? "Joining…" : `Pair up with ${invite.name}`}</button>
            <Link href="/discover" className="btn btn-ghost">Not now</Link>
          </div>
        </section>
      )}
    </main>
  );
}
