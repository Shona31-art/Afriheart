"use client";

import Link from "next/link";
import { useState } from "react";
import { IMPORTANCE_LABELS, MIN_COMMON, PACKS, QUESTIONS as ALL, type Answers, type Importance, type Pack } from "@/lib/compatibility";
import { apiSend } from "@/lib/client";
import { IconBack, IconHeart } from "./icons";

/** One question at a time: your answer, the answers you'd accept, and how much it matters. */
export function QuestionFlow({ initial, pack }: { initial: Answers; pack: Pack }) {
  const QUESTIONS = ALL.filter((x) => x.pack === pack);
  const info = PACKS.find((p) => p.id === pack)!;
  const firstOpen = QUESTIONS.findIndex((q) => !initial[q.id]);
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [answers, setAnswers] = useState<Answers>(initial);
  const q = QUESTIONS[i];
  const saved = answers[q?.id ?? ""];
  const [mine, setMine] = useState<string | null>(saved?.a ?? null);
  const [ok, setOk] = useState<string[]>(saved?.ok ?? []);
  const [imp, setImp] = useState<Importance>(saved?.imp ?? 2);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = QUESTIONS.filter((x) => answers[x.id]).length;
  const total = ALL.filter((x) => answers[x.id]).length;
  const finished = i >= QUESTIONS.length;

  function go(to: number) {
    const next = QUESTIONS[to];
    const a = next ? answers[next.id] : undefined;
    setI(to);
    setMine(a?.a ?? null);
    setOk(a?.ok && next && a.ok.length < next.options.length ? a.ok : []);
    setImp(a?.imp ?? 2);
    setError(null);
  }

  async function save() {
    if (!mine) return setError("Choose your answer first.");
    setBusy(true);
    try {
      const accept = ok.length ? ok : q.options.map((o) => o.id);
      await apiSend("/api/dating/answers", "POST", { question: q.id, a: mine, ok: accept, imp });
      setAnswers((all) => ({ ...all, [q.id]: { a: mine, ok: accept, imp } }));
      go(i + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="mb-3 flex items-center gap-1">
        <Link href="/discover" className="icon-btn -ml-3" aria-label="Back to Discover"><IconBack /></Link>
        <h1 className="display text-2xl">Compatibility</h1>
      </div>
      <nav aria-label="Question sets" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {PACKS.map((p) => (
          <Link key={p.id} href={p.id === "basics" ? "/dating/questions" : `/dating/questions?pack=${p.id}`}
            aria-current={p.id === pack ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-lg text-sm font-semibold ${p.id === pack ? "bg-card text-ink shadow-sm" : "text-muted"}`}>
            {p.title}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted">{info.blurb}</p>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{finished ? "All done" : `Question ${i + 1} of ${QUESTIONS.length}`}</span>
        <span>{done} answered</span>
      </div>
      <div className="mb-5 h-1.5 rounded-full bg-line" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={done}>
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(done / QUESTIONS.length) * 100}%` }} />
      </div>

      {finished ? (
        <section className="card flex flex-col items-center gap-3 py-8 text-center">
          <IconHeart size={40} className="text-accent" />
          <h2 className="display text-2xl">{total >= MIN_COMMON ? (pack === "deep" ? "You went deep" : "Your match % is on") : "Nearly there"}</h2>
          <p className="max-w-xs text-sm text-muted">
            {pack === "deep" && total >= MIN_COMMON
              ? "These count for more in your match %, and the ones you both answer give you real things to talk about. They only see answers you both share."
              : total >= MIN_COMMON
              ? "People who've answered too will see a match score with you, and the best matches show up first. They only see answers you both share."
              : `Answer at least ${MIN_COMMON} questions to see match scores.`}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => go(0)}>Review answers</button>
            {pack === "basics"
              ? <Link href="/dating/questions?pack=deep" className="btn btn-sm">Go deeper</Link>
              : <Link href="/discover" className="btn btn-sm">Back to Discover</Link>}
          </div>
        </section>
      ) : (
        <section aria-labelledby="q-text" className="flex flex-col gap-5">
          <h2 id="q-text" className="display text-2xl leading-snug">{q.text}</h2>
          {error && <p role="alert" className="rounded-xl bg-warm-soft px-4 py-2 text-sm text-warm-ink">{error}</p>}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Your answer</legend>
            {q.options.map((o) => (
              <label key={o.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-card px-4 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                <input type="radio" name="mine" checked={mine === o.id} onChange={() => setMine(o.id)} className="h-5 w-5 accent-[var(--accent)]" />
                {o.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Answers you&apos;d accept from a match</legend>
            <p className="-mt-1 text-xs text-muted">Leave all unticked if any answer is fine.</p>
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => (
                <label key={o.id} className="chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="checkbox" className="sr-only" checked={ok.includes(o.id)}
                    onChange={(e) => setOk((cur) => (e.target.checked ? [...cur, o.id] : cur.filter((x) => x !== o.id)))} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">How much does this matter to you?</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {IMPORTANCE_LABELS.map((l, n) => (
                <label key={l} className="chip min-h-11 cursor-pointer justify-center px-2 text-center text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="imp" className="sr-only" checked={imp === n} onChange={() => setImp(n as Importance)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-2">
            <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => go(i - 1)}>Back</button>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => go(i + 1)}>Skip</button>
              <button className="btn" disabled={busy || !mine} onClick={save}>{busy ? "Saving…" : i === QUESTIONS.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
          <p className="text-xs text-muted">Your answers are only used for match scores. People see the score and the answers you both share, never your other answers or what you&apos;d accept.</p>
        </section>
      )}
    </main>
  );
}
