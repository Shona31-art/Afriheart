"use client";

import "@fontsource/dancing-script/600.css";
import "@fontsource/caveat/500.css";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QUIZ_QUESTIONS, type QuizAnswerInput } from "@/lib/quiz-questions";
import { canvasBlob, drawQuizStory } from "@/lib/album";
import { shareImage, siteHost } from "@/lib/share";
import { IconHeart, IconSend } from "./icons";

type Answers = Record<string, QuizAnswerInput>;
interface Result { id: string; names: [string, string]; score: number; shared: string[]; differ: string[]; created_at: string }

const IMPORTANCE = ["Doesn't matter", "A little", "Somewhat", "Must match"];

async function call<T>(url: string, init?: RequestInit & { key?: string }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.key ? { "x-quiz-key": init.key } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: results only this visit */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Ten questions, one at a time: your answer and how much it matters. */
function QuizFlow({ onDone, busy, error }: { onDone: (a: Answers) => void; busy: boolean; error: string | null }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const q = QUIZ_QUESTIONS[i];
  const cur = answers[q.id];
  const set = (patch: Partial<QuizAnswerInput>) => setAnswers((all) => ({ ...all, [q.id]: { a: all[q.id]?.a ?? "", imp: all[q.id]?.imp ?? 2, ...patch } }));
  const last = i === QUIZ_QUESTIONS.length - 1;

  return (
    <section aria-labelledby="quiz-q" className="flex flex-col gap-5">
      <h1 className="text-sm font-semibold text-muted">Compatibility quiz</h1>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Question {i + 1} of {QUIZ_QUESTIONS.length}</span></div>
        <div className="h-1.5 rounded-full bg-line" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={QUIZ_QUESTIONS.length} aria-valuenow={i + 1}>
          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${((i + 1) / QUIZ_QUESTIONS.length) * 100}%` }} />
        </div>
      </div>
      <h2 id="quiz-q" className="display text-2xl leading-snug">{q.text}</h2>
      {error && <p role="alert" className="rounded-xl bg-warm-soft px-4 py-2 text-sm text-warm-ink">{error}</p>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Your answer</legend>
        {q.options.map((o) => (
          <label key={o.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-card px-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            <input type="radio" name={`a-${q.id}`} checked={cur?.a === o.id} onChange={() => set({ a: o.id })} className="h-5 w-5 accent-[var(--accent)]" />
            {o.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">How much does it matter that you agree?</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {IMPORTANCE.map((l, n) => (
            <label key={l} className="chip min-h-11 cursor-pointer justify-center px-2 text-center text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
              <input type="radio" name={`imp-${q.id}`} className="sr-only" checked={(cur?.imp ?? 2) === n} onChange={() => set({ imp: n })} />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-between gap-2">
        <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        <button className="btn" disabled={!cur?.a || busy} onClick={() => (last ? onDone({ ...answers, [q.id]: { a: cur!.a, imp: cur?.imp ?? 2 } }) : setI(i + 1))}>
          {busy ? "Working it out…" : last ? "See results" : "Next"}
        </button>
      </div>
    </section>
  );
}

function ResultCard({ r, viewer }: { r: Result; viewer: 0 | 1 }) {
  const [status, setStatus] = useState<string | null>(null);
  const other = r.names[viewer === 0 ? 1 : 0];
  async function share() {
    setStatus(null);
    try {
      const blob = await canvasBlob(await drawQuizStory(r, siteHost()));
      const how = await shareImage(blob, "compatibility.jpg", `We're ${r.score}% compatible ♥ Take the quiz together on Afriheart: ${window.location.origin}/quiz`);
      setStatus(how === "saved" ? "Saved. Post it from your photos." : how === "shared" ? "Shared!" : null);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <article aria-label={`Result with ${other}`} className="album-paper flex flex-col items-center gap-2 px-5 py-6 text-center" data-quiz-score={r.score}>
      <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[color:var(--album-soft)]">You and {other}</p>
      <p className="display text-6xl text-[color:var(--album-rose)]">{r.score}%</p>
      <p className="font-semibold text-[color:var(--album-ink)]">{r.score >= 80 ? "A strong match" : r.score >= 60 ? "Plenty in common" : r.score >= 40 ? "Worth a conversation" : "Opposites attract?"}</p>
      {r.shared.length > 0 && <p className="text-sm text-[color:var(--album-ink)]"><strong>You both</strong> {r.shared.join(", ")}.</p>}
      {r.differ.length > 0 && <p className="text-sm text-[color:var(--album-soft)]">Worth talking about: {r.differ.join(", ")}.</p>}
      <button className="btn btn-sm mt-2" onClick={share}><IconSend size={16} /> Share to Stories or TikTok</button>
      <p role="status" className="text-sm text-[color:var(--album-green)]">{status ?? ""}</p>
    </article>
  );
}

function Next() {
  return (
    <section className="card flex flex-col gap-3 text-sm">
      <h2 className="font-semibold">What next?</h2>
      <Link href="/quiz" className="btn btn-ghost">Make your own quiz to send</Link>
      <Link href="/alphabet-dates" className="btn btn-ghost">Try alphabet dates together</Link>
      <Link href="/signin?next=/discover" className="btn">Meet people you click with on Afriheart</Link>
    </section>
  );
}

const shell = (children: React.ReactNode) => (
  <main className="page album mx-auto w-full max-w-xl">
    <p className="mb-3 text-sm font-semibold text-accent"><Link href="/">Afriheart</Link></p>
    {children}
    <p className="mt-6 text-xs text-muted">Answers are kept for 30 days, then deleted. Nobody sees your answers, only the score and what you share. <Link href="/privacy" className="underline">Privacy</Link></p>
  </main>
);

/** /quiz: make a quiz, then send the link. */
export function QuizHome() {
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [made, setMade] = useState<{ slug: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (made) {
    const url = `${window.location.origin}/quiz/${made.slug}`;
    const text = `How compatible are we? Take my 10-question quiz: ${url}`;
    return shell(
      <section className="flex flex-col gap-4">
        <h1 className="display text-3xl">Now send it</h1>
        <p className="text-muted">Send this link to a date, your partner or a friend. When they&apos;ve answered, you&apos;ll both see your match % here.</p>
        <p className="break-all rounded-xl border border-line bg-card px-4 py-3 text-sm" data-quiz-link={url}>{url}</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
          <button className="btn btn-ghost" onClick={async () => {
            if (typeof navigator.share === "function") { await navigator.share({ text, url }).catch(() => undefined); return; }
            await navigator.clipboard?.writeText(url).then(() => setCopied(true), () => undefined);
          }}>{copied ? "Link copied" : "Share or copy link"}</button>
        </div>
        <Link href={`/quiz/${made.slug}`} className="btn btn-ghost self-start">See who&apos;s answered</Link>
      </section>,
    );
  }

  if (!started) {
    return shell(
      <section className="album-paper flex flex-col items-center gap-3 px-6 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[color:var(--album-soft)]">10 questions · 2 minutes</p>
        <h1 className="font-script text-5xl leading-tight text-[color:var(--album-ink)]">How compatible are you?</h1>
        <p className="max-w-sm text-sm text-[color:var(--album-soft)]">Answer ten questions, from kids and money to what counts as cheating (and the worm question). Send it to someone, and you&apos;ll both see your match %.</p>
        <form className="mt-2 flex w-full max-w-xs flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) setStarted(true); }}>
          <label htmlFor="quiz-name" className="text-left text-sm font-semibold text-[color:var(--album-ink)]">Your first name</label>
          <input id="quiz-name" className="field" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          <button className="btn" disabled={!name.trim()}>Start</button>
        </form>
      </section>,
    );
  }

  return shell(
    <QuizFlow busy={busy} error={error} onDone={async (answers) => {
      setBusy(true);
      setError(null);
      try {
        const r = await call<{ slug: string; key: string }>("/api/quiz", { method: "POST", body: JSON.stringify({ name, answers }) });
        store.set(`quiz-owner:${r.slug}`, r.key);
        setMade({ slug: r.slug });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }} />,
  );
}

/** /quiz/<slug>: the maker sees results; anyone else takes the quiz and sees their result. */
export function QuizTake({ slug }: { slug: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "gone"; message: string }
    | { kind: "owner"; name: string; results: Result[] }
    | { kind: "intro"; name: string }
    | { kind: "taking"; name: string; me: string }
    | { kind: "done"; result: Result }
  >({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState("");

  const load = useCallback(async () => {
    try {
      const ownerKey = store.get(`quiz-owner:${slug}`);
      if (ownerKey) {
        const r = await call<{ name: string; results: Result[] }>(`/api/quiz/${slug}/results`, { key: ownerKey });
        return setState({ kind: "owner", name: r.name, results: r.results });
      }
      const mine = store.get(`quiz-answer:${slug}`);
      if (mine) {
        const [id, key] = mine.split(" ");
        const result = await call<Result>(`/api/quiz/${slug}/r/${id}`, { key }).catch(() => null);
        if (result) return setState({ kind: "done", result });
      }
      const info = await call<{ name: string }>(`/api/quiz/${slug}`);
      setState({ kind: "intro", name: info.name });
    } catch (e) {
      setState({ kind: "gone", message: (e as Error).message });
    }
  }, [slug]);

  useEffect(() => {
    // Loading what this phone has for the quiz (from storage and the server) once on arrival.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    if (state.kind !== "owner") return;
    const t = setInterval(load, 8000); // new answers appear while the maker waits
    return () => clearInterval(t);
  }, [state.kind, load]);

  if (state.kind === "loading") return shell(<p role="status" className="text-muted">Loading the quiz…</p>);
  if (state.kind === "gone") return shell(<section className="flex flex-col gap-3"><h1 className="display text-3xl">Quiz not found</h1><p className="text-muted">{state.message}</p><Next /></section>);

  if (state.kind === "owner") {
    const url = `${window.location.origin}/quiz/${slug}`;
    return shell(
      <section className="flex flex-col gap-4">
        <h1 className="display text-3xl">Your quiz</h1>
        <p className="text-muted">Share this link. Each person who answers shows up here.</p>
        <p className="break-all rounded-xl border border-line bg-card px-4 py-3 text-sm">{url}</p>
        <a className="btn self-start" href={`https://wa.me/?text=${encodeURIComponent(`How compatible are we? Take my 10-question quiz: ${url}`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
        {state.results.length === 0 ? (
          <p className="card text-sm text-muted" role="status">Nobody has answered yet. This page updates by itself.</p>
        ) : state.results.map((r) => <ResultCard key={r.id} r={r} viewer={0} />)}
        <button className="self-start text-sm font-semibold text-danger underline" onClick={async () => {
          if (!confirm("Delete this quiz and everyone's answers now?")) return;
          await call(`/api/quiz/${slug}`, { method: "DELETE", key: store.get(`quiz-owner:${slug}`) ?? "" }).catch(() => undefined);
          store.del(`quiz-owner:${slug}`);
          setState({ kind: "gone", message: "Deleted. Your quiz and all its answers are gone." });
        }}>Delete this quiz</button>
      </section>,
    );
  }

  if (state.kind === "intro") {
    return shell(
      <section className="album-paper flex flex-col items-center gap-3 px-6 py-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[color:var(--album-soft)]">10 questions · 2 minutes</p>
        <h1 className="font-script text-5xl leading-tight text-[color:var(--album-ink)]">How compatible are you and {state.name}?</h1>
        <p className="max-w-sm text-sm text-[color:var(--album-soft)]">{state.name} answered ten questions. Answer the same ones and you&apos;ll both see your match %. Neither of you sees the other&apos;s answers, only what you share.</p>
        <form className="mt-2 flex w-full max-w-xs flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (me.trim()) setState({ kind: "taking", name: state.name, me: me.trim() }); }}>
          <label htmlFor="quiz-me" className="text-left text-sm font-semibold text-[color:var(--album-ink)]">Your first name</label>
          <input id="quiz-me" className="field" value={me} maxLength={30} onChange={(e) => setMe(e.target.value)} autoComplete="given-name" required />
          <button className="btn" disabled={!me.trim()}>Start</button>
        </form>
      </section>,
    );
  }

  if (state.kind === "taking") {
    return shell(
      <QuizFlow busy={busy} error={error} onDone={async (answers) => {
        setBusy(true);
        setError(null);
        try {
          const r = await call<{ key: string; result: Result }>(`/api/quiz/${slug}`, { method: "POST", body: JSON.stringify({ name: state.me, answers }) });
          store.set(`quiz-answer:${slug}`, `${r.result.id} ${r.key}`);
          setState({ kind: "done", result: r.result });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }} />,
    );
  }

  return shell(
    <section className="flex flex-col gap-4">
      <h1 className="display flex items-center gap-2 text-3xl"><IconHeart className="text-accent" /> Your result</h1>
      <ResultCard r={state.result} viewer={1} />
      <p className="text-sm text-muted">{state.result.names[0]} sees this result too.</p>
      <Next />
    </section>,
  );
}
