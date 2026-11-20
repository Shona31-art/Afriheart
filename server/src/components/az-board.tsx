"use client";

import "@fontsource/dancing-script/600.css";
import "@fontsource/caveat/500.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { mediaUrl, openMessage, sendEncrypted, uploadEncrypted } from "@/lib/e2e-device";
import { albumPdf, canvasBlob, clampRating, drawPage, drawPageStory, niceDate, saveFile, THEMES, type AlbumPage } from "@/lib/album";
import { shareImage, siteHost } from "@/lib/share";
import { LOOKS, STYLES, type AlbumLook, type DateStyle } from "@/lib/alphabet-ideas";
import type { AzBoard as Board, AzLetter, Sealed } from "@/lib/az";
import { shrink } from "./composer";
import { useLive } from "@/lib/live";
import { IconBack, IconCalendar, IconCamera, IconClose, IconEdit, IconHeart, IconImage, IconLock, IconSend, IconSparkle } from "./icons";

const today = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, local

/** Decrypts one album page's photo and story on this phone. */
async function openPage(chatId: string, meId: string, l: AzLetter): Promise<AlbumPage> {
  const page: AlbumPage = { letter: l.letter, activity: l.activity, done: l.status === "done", photo: null, story: "", rating: 0, when: l.done_at?.slice(0, 10) ?? "" };
  const open = async (s: Sealed | null) => (s ? openMessage(chatId, meId, s.cipher, s.sender_id) : null);
  const [photo, story] = await Promise.all([open(l.photo), open(l.story)]);
  if (photo?.ok && photo.payload.t === "image") {
    const p = photo.payload;
    page.photo = await mediaUrl(p.path, p.key, p.iv, p.mime).catch(() => null);
  }
  if (story?.ok && story.payload.t === "story" && story.payload.letter === l.letter) {
    page.story = String(story.payload.story ?? "").slice(0, 400);
    page.rating = clampRating(story.payload.rating);
    if (/^\d{4}-\d{2}-\d{2}$/.test(story.payload.when)) page.when = story.payload.when;
  }
  return page;
}

function usePage(chatId: string, meId: string, l: AzLetter): AlbumPage | null {
  const [page, setPage] = useState<AlbumPage | null>(null);
  // Decrypting is cached per message, so re-running this when the board refreshes is cheap.
  useEffect(() => {
    let live = true;
    openPage(chatId, meId, l).then((p) => live && setPage(p), () => undefined);
    return () => { live = false; };
  }, [chatId, meId, l]);
  return page;
}

/** The couple's alphabet date ideas, kept as an album you can export. */
export function AzBoard({ chatId, meId, myName, title, initial }: { chatId: string; meId: string; myName: string; title: string; initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [open, setOpen] = useState<{ letter: string; preset?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const refresh = useCallback(() => apiGet<Board>(`/api/chats/${chatId}/az`).then(setBoard, () => undefined), [chatId]);

  // The other person's changes appear as soon as a realtime nudge arrives; a slow poll is the backup.
  useLive((n) => { if (n.chat === chatId || n.resync) refresh(); });
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const t = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  const entry = board.letters.find((l) => l.letter === open?.letter) ?? null;
  const style = STYLES.find((st) => st.id === board.style)!;

  /** Picks a letter you haven't done and an idea for it in your style. */
  function surprise() {
    const todo = board.letters.filter((l) => l.status === "idea");
    const pool = todo.length ? todo : board.letters.filter((l) => l.status !== "done");
    if (!pool.length) return;
    const l = pool[Math.floor(Math.random() * pool.length)];
    const ideas = l.ideas[0].items.filter((x) => x !== l.activity);
    setOpen({ letter: l.letter, preset: ideas[Math.floor(Math.random() * ideas.length)] ?? l.activity });
  }
  const names = `${myName.split(" ")[0]} & ${title.split(" ")[0]}`;

  return (
    <main className="page album" data-look={board.look}>
      <div className="mb-3 flex items-center gap-1">
        <Link href={`/chats/${chatId}`} className="icon-btn -ml-3" aria-label="Back to chat"><IconBack /></Link>
        <h1 className="text-sm font-semibold text-muted">Alphabet date ideas</h1>
      </div>

      <section aria-label="Album cover" className="album-paper mb-4 flex flex-col items-center px-6 py-8 text-center">
        <p aria-hidden className="font-script text-5xl leading-[1.05] text-[color:var(--album-ink)]">Alphabet<br />date ideas</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[.2em] text-[color:var(--album-soft)]">Dates from A to Z</p>
        <p className="font-hand mt-3 text-3xl text-[color:var(--album-green)]">{names}</p>
        <p className="font-hand text-xl text-[color:var(--album-soft)]">{board.done === 26 ? "All 26 dates done!" : `${board.done} of 26 dates so far`}</p>
        <div className="mt-4 h-1.5 w-full max-w-60 rounded-full bg-[color:var(--album-rule)]" role="progressbar" aria-label="Alphabet dates done" aria-valuemin={0} aria-valuemax={26} aria-valuenow={board.done}>
          <div className="h-1.5 rounded-full bg-[color:var(--album-rose)]" style={{ width: `${(board.done / 26) * 100}%` }} />
        </div>
        <p className="mt-3 text-sm text-[color:var(--album-soft)]">Style: <strong className="text-[color:var(--album-ink)]">{style.name}</strong> · {LOOKS.find((x) => x.id === board.look)?.name}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn" onClick={() => setExporting(true)}>Export album</button>
          <button className="btn btn-ghost" onClick={() => setSettings(true)}>Style and look</button>
          {board.done < 26 && <button className="btn btn-ghost" onClick={surprise}><IconSparkle size={18} /> Surprise us</button>}
        </div>
      </section>

      <nav aria-label="Letters" className="mb-5">
        <ul className="flex flex-wrap justify-center gap-1.5">
          {board.letters.map((l) => (
            <li key={l.letter}>
              <a href={`#page-${l.letter}`} aria-label={`${l.letter}, ${l.activity}${l.status === "done" ? ", done" : l.status === "planned" ? ", planned" : ""}`}
                className={`display flex h-11 w-11 items-center justify-center rounded-full border text-lg ${l.status === "done" ? "border-[color:var(--album-rose)] bg-[color:var(--album-rose)] text-[color:var(--album-paper)]" : l.status === "planned" ? "border-[color:var(--album-rose)] text-[color:var(--album-rose)]" : "border-line text-muted"}`}>
                {l.letter}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-6">
        {board.letters.map((l, i) => (
          <Page key={l.letter} chatId={chatId} meId={meId} l={l} i={i} look={board.look} onEdit={() => setOpen({ letter: l.letter })} />
        ))}
      </div>

      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted">
        <IconLock size={14} className="mt-0.5 shrink-0" />
        Photos and stories are sent into your chat end-to-end encrypted, so only the two of you can see them. The album is put together on your phone, including when you export it.
      </p>

      {entry && <Sheet key={`${entry.letter}:${entry.activity}:${entry.story?.message_id}:${open?.preset}`} chatId={chatId} meId={meId} l={entry} i={board.letters.indexOf(entry)} look={board.look} preset={open?.preset} onClose={() => setOpen(null)} onBoard={setBoard} />}
      {exporting && <ExportSheet chatId={chatId} meId={meId} board={board} names={names} onClose={() => setExporting(false)} />}
      {settings && <SettingsSheet chatId={chatId} board={board} onBoard={setBoard} onClose={() => setSettings(false)} />}
    </main>
  );
}

function Hearts({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${n} out of 5 hearts`}>
      {[0, 1, 2, 3, 4].map((k) => (
        <IconHeart key={k} size={size} className="text-[color:var(--album-rose)]" fill={k < n ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

function Page({ chatId, meId, l, i, look, onEdit }: { chatId: string; meId: string; l: AzLetter; i: number; look: AlbumLook; onEdit: () => void }) {
  const page = usePage(chatId, meId, l);
  const done = l.status === "done";
  const others = l.ideas[0].items.filter((x) => x !== l.activity).slice(0, 3);
  return (
    <article id={`page-${l.letter}`} aria-labelledby={`title-${l.letter}`} data-az={l.letter} data-az-status={l.status}
      className="album-paper scroll-mt-4 px-5 pb-5 pt-4">
      <div className="flex items-start justify-between">
        <span aria-hidden className="display text-6xl leading-none text-[color:var(--album-green)]">{l.letter}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-[color:var(--album-soft)]">{i + 1} / 26{l.status === "planned" ? " · Planned" : ""}</span>
      </div>
      <h2 id={`title-${l.letter}`} className="font-script -mt-2 mb-6 text-center text-4xl leading-tight text-[color:var(--album-ink)]">
        <span className="sr-only">{l.letter} is for </span>{l.activity}
      </h2>

      <figure className={`polaroid mx-auto w-[82%] max-w-xs ${i % 2 ? "rotate-[2deg]" : "-rotate-[2deg]"}`}>
        <span aria-hidden className="polaroid-tape" />
        {page?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.photo} alt={`Your ${l.activity} date`} className="aspect-square w-full object-cover" />
        ) : (
          <button onClick={onEdit} className="font-hand flex aspect-square w-full items-center justify-center border-2 border-dashed border-[color:var(--album-dash)] bg-[color:var(--album-blank)] text-2xl text-[color:var(--album-soft)]">
            {done ? (l.photo ? "Opening photo…" : "Add your photo") : "Your photo goes here"}
          </button>
        )}
      </figure>
      <div aria-hidden className="my-2 flex justify-center gap-1 text-[color:var(--album-rose)]">
        <IconHeart size={16} fill="currentColor" /><IconHeart size={12} /><IconHeart size={14} fill="currentColor" className="text-[color:var(--album-rose2)]" />
      </div>
      <Deco look={look} />

      <div className="relative mt-4 rounded-lg border-2 border-[color:var(--album-rule)] px-4 pb-3 pt-5">
        <span className="font-script absolute -top-5 left-3 bg-[color:var(--album-paper)] px-2 text-2xl text-[color:var(--album-green)]">Our story</span>
        {page?.story ? (
          <p className="album-lines font-hand whitespace-pre-line text-2xl leading-[2.25rem] text-[color:var(--album-ink)]">{page.story}</p>
        ) : (
          <p className="album-lines font-hand text-xl leading-[2.25rem] text-[color:var(--album-soft)]">
            {done ? "One little story about this date…" : others.length ? `Other ideas: ${others.join(", ")}` : "One little story about this date…"}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm"><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-[color:var(--album-soft)]">Date </span><span className="font-hand text-xl text-[color:var(--album-ink)]">{niceDate(page?.when ?? "") || "______"}</span></p>
        <Hearts n={page?.rating ?? 0} />
      </div>
      <button className="btn btn-ghost btn-sm mt-3 w-full" onClick={onEdit}>
        <IconEdit size={16} /> {done ? `Edit ${l.letter}` : `Fill in ${l.letter}`}
      </button>
    </article>
  );
}

function Sheet({ chatId, meId, l, i, look, preset, onClose, onBoard }: { chatId: string; meId: string; l: AzLetter; i: number; look: AlbumLook; preset?: string; onClose: () => void; onBoard: (b: Board) => void }) {
  const page = usePage(chatId, meId, l);
  const [name, setName] = useState(preset ?? l.activity);
  const every = l.ideas.flatMap((g) => g.items);
  const surprise = () => {
    const pool = every.filter((x) => x !== name.trim());
    setName(pool[Math.floor(Math.random() * pool.length)]);
  };
  const [story, setStory] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const s = story ?? page?.story ?? "";
  const r = rating ?? page?.rating ?? 0;
  const w = when ?? (page?.when || today());
  const storyChanged = (story !== null && story !== (page?.story ?? "")) || (rating !== null && rating !== page?.rating) || (when !== null && when !== page?.when);
  const nameChanged = name.trim() !== l.activity && name.trim().length >= 2;

  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function run(what: string, fn: () => Promise<Board | void>) {
    setBusy(what);
    setError(null);
    try {
      const b = await fn();
      if (b) onBoard(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const post = (b: Record<string, unknown>) => apiSend<Board>(`/api/chats/${chatId}/az`, "POST", { letter: l.letter, ...b });

  const save = () => run("save", async () => {
    let b: Board | undefined;
    const activity = nameChanged ? name.trim().replace(/\s+/g, " ") : l.activity;
    if (nameChanged) b = await post({ action: "rename", activity });
    if (storyChanged) {
      const id = await sendEncrypted(chatId, meId, { t: "story", letter: l.letter, activity, story: s.trim().slice(0, 400), rating: r, when: w });
      b = await post({ action: "story", message_id: id });
    }
    return b;
  });

  const addPhoto = (file: File) => run("photo", async () => {
    const blob = await shrink(file);
    const up = await uploadEncrypted(chatId, blob);
    const id = await sendEncrypted(chatId, meId, { t: "image", ...up, mime: "image/jpeg", caption: `${l.letter} is for ${l.activity} ✓ (Alphabet date ideas)` });
    return post({ action: "done", message_id: id });
  });

  const saveImage = () => run("image", async () => {
    if (!page) return;
    const canvas = await drawPage({ ...page, activity: l.activity, story: s, rating: r, when: page.done || storyChanged ? w : page.when }, i, THEMES[look]);
    await saveFile(await canvasBlob(canvas), `alphabet-date-${l.letter}.jpg`);
  });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="az-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id="az-title" className="display text-2xl leading-snug">
            <span className="text-accent">{l.letter}</span> is for {l.activity}
          </h2>
          <button ref={closeRef} className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}

        {preset && preset !== l.activity && <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm">Surprise! How about <strong>{preset}</strong>? Save it, or pick something else.</p>}
        <fieldset className="mb-3">
          <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-sm font-semibold">
            Pick a date idea
          </legend>
          <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={surprise}><IconSparkle size={16} /> Surprise us</button>
          {l.ideas.map((g) => (
            <div key={g.style} className="mb-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((idea) => (
                  <label key={idea} className="chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                    <input type="radio" name="idea" className="sr-only" checked={name.trim() === idea} onChange={() => setName(idea)} />
                    {idea}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <label htmlFor="az-name" className="text-sm font-semibold">Or write your own</label>
        <input id="az-name" className="field mb-4 mt-1 w-full" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />

        <div className="mb-4 flex flex-col gap-2">
          <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            <IconCamera size={18} /> {busy === "photo" ? "Sending photo…" : l.status === "done" ? "Change photo" : "We did it: add a photo"}
          </button>
          {l.status !== "done" && (
            l.plan_slug
              ? <Link href={`/p/${l.plan_slug}`} className="btn btn-ghost"><IconCalendar size={18} /> Open the plan</Link>
              : <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("plan", async () => (await apiSend<{ board: Board }>(`/api/chats/${chatId}/az`, "POST", { letter: l.letter, action: "plan" })).board)}>
                  <IconCalendar size={18} /> {busy === "plan" ? "Making a plan…" : "Plan it in the chat"}
                </button>
          )}
        </div>

        <label htmlFor="az-story" className="text-sm font-semibold">Our story</label>
        <textarea id="az-story" className="field font-hand mb-3 mt-1 min-h-24 w-full text-xl" maxLength={400} placeholder="One little story about this date…" value={s} onChange={(e) => setStory(e.target.value)} />
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            When we went
            <input type="date" className="field" value={w} max={today()} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">How was it?</legend>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex h-11 w-10 cursor-pointer items-center justify-center rounded-lg text-[color:var(--album-rose)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="rating" className="sr-only" checked={r === n} onChange={() => setRating(n)} aria-label={`${n} ${n === 1 ? "heart" : "hearts"}`} />
                  <IconHeart size={26} fill={n <= r ? "currentColor" : "none"} />
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <button className="btn mb-2 w-full" disabled={!!busy || (!storyChanged && !nameChanged)} onClick={save}>{busy === "save" ? "Saving…" : "Save page"}</button>
        {l.status === "done" && page?.photo && (
          <button className="btn btn-ghost mb-2 w-full" disabled={!!busy} onClick={() => setSharing(true)}><IconSend size={18} /> Share to Stories or TikTok</button>
        )}
        {sharing && page && <ShareStory page={{ ...page, activity: l.activity, story: s, rating: r, when: page.done || storyChanged ? w : page.when }} i={i} look={look} onClose={() => setSharing(false)} />}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" disabled={!!busy || !page} onClick={saveImage}><IconImage size={16} /> {busy === "image" ? "Drawing…" : "Save page as image"}</button>
          {l.status === "done" && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run("undo", () => post({ action: "undo" }))}>Not done yet</button>}
        </div>
        <p className="mt-3 text-xs text-muted">Photos and stories also go into your chat, end-to-end encrypted.</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label={`Photo for ${l.letter}`}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addPhoto(f); }} />
      </div>
    </div>
  );
}

function ExportSheet({ chatId, meId, board, names, onClose }: { chatId: string; meId: string; board: Board; names: string; onClose: () => void }) {
  const [which, setWhich] = useState<"done" | "all">(board.done ? "done" : "all");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function go() {
    setError(null);
    setSaved(false);
    setProgress("Opening your photos…");
    try {
      const pages = await Promise.all(board.letters.map((l) => openPage(chatId, meId, l)));
      const chosen = which === "done" ? pages.filter((p) => p.done) : pages;
      const style = STYLES.find((st) => st.id === board.style)?.name;
      const pdf = await albumPdf({ names, done: board.done, pages, style }, chosen, THEMES[board.look], (n, of) => setProgress(`Drawing page ${n} of ${of}…`));
      await saveFile(pdf, `alphabet-date-ideas-${names.replace(/[^a-z]+/gi, "-").toLowerCase()}.pdf`);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message || "Couldn't make the PDF.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 id="export-title" className="display text-2xl">Export your album</h2>
          <button ref={closeRef} className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <p className="mb-3 text-sm text-muted">A PDF with a cover and one A4 page per date, ready to print, keep or share. It&apos;s made on your phone, so your photos stay private.</p>
        {error && <p role="alert" className="mb-3 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
        <fieldset className="mb-4 flex flex-col gap-1">
          <legend className="sr-only">Pages</legend>
          <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 has-[:checked]:bg-accent-soft has-[:disabled]:opacity-50">
            <input type="radio" name="which" checked={which === "done"} disabled={!board.done} onChange={() => setWhich("done")} className="h-5 w-5 accent-[var(--accent)]" />
            Dates we&apos;ve done ({board.done})
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 has-[:checked]:bg-accent-soft">
            <input type="radio" name="which" checked={which === "all"} onChange={() => setWhich("all")} className="h-5 w-5 accent-[var(--accent)]" />
            All 26 pages (blank ones to fill in by hand)
          </label>
        </fieldset>
        <button className="btn w-full" disabled={!!progress} onClick={go}>{progress ?? "Save as PDF"}</button>
        <p role="status" className="mt-2 text-center text-sm text-accent">{saved ? "Saved. Look in your downloads." : ""}</p>
      </div>
    </div>
  );
}

/** A small corner decoration that matches the album look. */
function Deco({ look }: { look: AlbumLook }) {
  const common = "pointer-events-none absolute right-4 top-14 h-14 w-14";
  if (look === "floral") {
    return (
      <svg aria-hidden viewBox="0 0 56 56" className={common}>
        {[[20, 20, 9, "var(--album-rose2)"], [40, 34, 6, "var(--album-rose)"], [14, 42, 5, "var(--album-rose2)"]].map(([x, y, r, c], k) => (
          <g key={k} transform={`translate(${x} ${y})`}>
            {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy={-(r as number) * 0.9} rx={(r as number) * 0.55} ry={(r as number) * 0.9} fill={c as string} transform={`rotate(${a})`} />)}
            <circle r={(r as number) * 0.45} fill="#f6d58e" />
          </g>
        ))}
      </svg>
    );
  }
  if (look === "midnight") {
    return (
      <svg aria-hidden viewBox="0 0 56 56" className={common} fill="var(--album-green)">
        {[[18, 16, 8], [40, 28, 5], [24, 44, 4], [46, 8, 3]].map(([x, y, r], k) => (
          <path key={k} d={`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3}Z`} />
        ))}
      </svg>
    );
  }
  if (look === "sunny") {
    return (
      <svg aria-hidden viewBox="0 0 56 56" className={common}>
        {[[14, 14, 5, "var(--album-rose)"], [36, 10, 4, "var(--album-rose2)"], [44, 30, 6, "#f2b705"], [22, 34, 3, "var(--album-green)"], [32, 48, 4, "var(--album-rose)"]].map(([x, y, r, c], k) => <circle key={k} cx={x} cy={y} r={r} fill={c as string} />)}
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 56 56" className={common} fill="none" stroke="#9fb3a5" strokeWidth="1.5">
      <path d="M10 52 Q22 30 18 6" />
      {[[16, 40, -30], [20, 30, 30], [17, 20, -30], [20, 12, 30]].map(([x, y, a], k) => <ellipse key={k} cx={x} cy={y} rx="6" ry="2.6" fill="#c9d6cc" stroke="none" transform={`rotate(${a} ${x} ${y})`} />)}
    </svg>
  );
}

/** The album's date style and look, shared by both of you. */
function SettingsSheet({ chatId, board, onBoard, onClose }: { chatId: string; board: Board; onBoard: (b: Board) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const set = (b: { style?: DateStyle; look?: AlbumLook }) =>
    apiSend<Board>(`/api/chats/${chatId}/az`, "POST", { action: "album", ...b }).then(onBoard, (e: Error) => setError(e.message));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 id="settings-title" className="display text-2xl">Style and look</h2>
          <button ref={closeRef} className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close"><IconClose /></button>
        </div>
        <p className="mb-3 text-sm text-muted">You both see the same album. Letters you&apos;ve already picked, planned or done keep their date.</p>
        {error && <p role="alert" className="mb-3 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
        <fieldset className="mb-4 flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">Date style</legend>
          {STYLES.map((st) => (
            <label key={st.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
              <input type="radio" name="style" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={board.style === st.id} onChange={() => set({ style: st.id })} />
              <span>
                <span className="block font-semibold">{st.name}</span>
                <span className="block text-sm text-muted">{st.blurb} A: {board.letters[0].ideas.find((g) => g.style === st.id)?.items.slice(0, 2).join(", ")}…</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Album look</legend>
          <div className="grid grid-cols-2 gap-2">
            {LOOKS.map((lk) => {
              const t = THEMES[lk.id];
              return (
                <label key={lk.id} className="flex min-h-12 cursor-pointer flex-col gap-2 rounded-xl border border-line p-2 has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                  <input type="radio" name="look" className="sr-only" checked={board.look === lk.id} onChange={() => set({ look: lk.id })} />
                  <span aria-hidden className="flex h-16 items-center justify-between rounded-lg px-3" style={{ background: t.paper }}>
                    <span className="display text-3xl" style={{ color: t.accent }}>A</span>
                    <span className="font-script text-xl" style={{ color: t.ink }}>Aquarium</span>
                    <span style={{ color: t.rose }}><IconHeart size={16} fill="currentColor" /></span>
                  </span>
                  <span className="text-sm font-semibold">{lk.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

/** A Story-sized image of one page, with "Made on Afriheart", for TikTok, Instagram or WhatsApp. */
function ShareStory({ page, i, look, onClose }: { page: AlbumPage; i: number; look: AlbumLook; onClose: () => void }) {
  const [withStory, setWithStory] = useState(true);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    let url = "";
    const shown = withStory ? page : { ...page, story: "Our story stays between us ♥" };
    drawPageStory(shown, i, THEMES[look], siteHost()).then(canvasBlob).then((blob) => {
      if (!live) return;
      url = URL.createObjectURL(blob);
      setPreview({ url, blob });
    }, () => live && setStatus("Couldn't draw the image."));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [page, i, look, withStory]);

  async function share() {
    if (!preview) return;
    setBusy(true);
    setStatus(null);
    try {
      const how = await shareImage(preview.blob, `alphabet-date-${page.letter}.jpg`, `${page.letter} is for ${page.activity} ♥ Our alphabet dates on Afriheart: ${window.location.origin}/alphabet-dates`);
      setStatus(how === "saved" ? "Saved. Post it from your photos." : how === "shared" ? "Shared!" : null);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Share this page" className="mb-3 rounded-2xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Share this page</p>
        <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close sharing"><IconClose size={18} /></button>
      </div>
      <div className="mx-auto mb-3 aspect-[9/16] w-40 overflow-hidden rounded-xl bg-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview.url} alt={`Story image of ${page.letter} is for ${page.activity}`} className="h-full w-full object-cover" />}
      </div>
      <label className="mb-2 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={withStory} onChange={(e) => setWithStory(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--accent)]" />
        <span>Include our story</span>
      </label>
      <p className="mb-3 text-xs text-muted">Whoever you share with will see this photo{withStory ? " and story" : ""}. It&apos;s posted outside Afriheart&apos;s encryption.</p>
      <button className="btn w-full" disabled={!preview || busy} onClick={share}><IconSend size={18} /> {busy ? "Opening…" : "Share"}</button>
      <p role="status" className="mt-2 text-center text-sm text-accent">{status ?? ""}</p>
    </section>
  );
}
