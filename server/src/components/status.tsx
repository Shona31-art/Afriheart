"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, clock, dayLabel, listTime } from "@/lib/client";
import { mediaUrl, openMessage, postStatus, sendEncrypted, uploadStatusPhoto, type Opened } from "@/lib/e2e-device";
import type { Payload } from "@/lib/e2e-crypto";
import { useLive } from "@/lib/live";
import { Avatar } from "./avatar";
import { shrink } from "./composer";
import { IconBack, IconClose, IconImage, IconPlus, IconSend, IconTrash } from "./icons";

// Status: text or a photo for 24 hours, end-to-end encrypted for the people you chat with one-to-one.

export interface StatusFeed {
  mine: { id: string; cipher: string; created_at: string; views: { name: string; at: string }[] }[];
  others: { person_id: string; name: string; chat_id: string; unseen: number; latest: string; items: { id: string; cipher: string; created_at: string; seen: boolean }[] }[];
}

export const STATUS_COLOURS = ["#0f5c4d", "#b4482b", "#5b3f8c", "#1d5e8c", "#8a6a12", "#2b2b2b"];

function useFeed() {
  const [feed, setFeed] = useState<StatusFeed | null>(null);
  const load = useCallback(() => apiGet<StatusFeed>("/api/status").then(setFeed).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);
  useLive((n) => { if (n.chat || n.resync) load(); });
  return { feed, load };
}

/** The row of status circles at the top of the chat list. */
export function StatusStrip({ personId }: { personId: string }) {
  const { feed } = useFeed();
  void personId;
  if (!feed) return null;
  return (
    <section aria-label="Status updates" className="px-2 pb-2" data-status-strip>
      <ul className="flex gap-3 overflow-x-auto px-2 py-1">
        <li className="shrink-0">
          <Link href={feed.mine.length ? "/status?p=me" : "/status/new"} className="flex w-16 flex-col items-center gap-1 text-center">
            <span className={`relative rounded-full p-0.5 ${feed.mine.length ? "ring-2 ring-line" : ""}`}>
              <Avatar name="You" seed={personId} size={52} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-paper bg-accent text-accent-ink"><IconPlus size={12} /></span>
            </span>
            <span className="w-full truncate text-xs">My status</span>
          </Link>
        </li>
        {feed.others.map((o) => (
          <li key={o.person_id} className="shrink-0">
            <Link href={`/status?p=${o.person_id}`} className="flex w-16 flex-col items-center gap-1 text-center" data-status-person={o.person_id}>
              <span className={`rounded-full p-0.5 ring-2 ${o.unseen ? "ring-accent" : "ring-line"}`}>
                <Avatar name={o.name} seed={o.person_id} size={52} />
              </span>
              <span className={`w-full truncate text-xs ${o.unseen ? "font-semibold" : "text-muted"}`}>{o.name.split(" ")[0]}</span>
              <span className="sr-only">{o.unseen ? `${o.unseen} new` : "seen"}, {listTime(o.latest)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Full-screen status viewer: taps go back and forward, each item shows for 6 seconds. */
export function StatusViewer({ personId, who }: { personId: string; who: string }) {
  const router = useRouter();
  const { feed, load } = useFeed();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [showViews, setShowViews] = useState(false);
  const mine = who === "me";
  const person = mine ? null : feed?.others.find((o) => o.person_id === who) ?? null;
  const items = mine ? feed?.mine ?? [] : person?.items ?? [];
  const owner = mine ? personId : who;
  const item = items[Math.min(i, items.length - 1)];
  const opened = useStatusOpened(owner, personId, item?.cipher ?? null);

  // Start at the first one not seen yet (decided once, when the feed arrives).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  if (person && startedAt === null) {
    const first = person.items.findIndex((x) => !x.seen);
    setStartedAt(Math.max(0, first));
    if (first > 0) setI(first);
  }

  // Mark as seen.
  useEffect(() => {
    if (!item || mine) return;
    apiSend(`/api/status/${item.id}`, "POST").catch(() => undefined);
  }, [item, mine]);

  const next = useCallback(() => {
    if (i + 1 < items.length) setI(i + 1);
    else router.push("/");
  }, [i, items.length, router]);
  useEffect(() => {
    if (!item || paused || reply || showViews) return;
    const t = setTimeout(next, 6000);
    return () => clearTimeout(t);
  }, [item, paused, reply, showViews, next]);

  if (!feed) return <main className="fixed inset-0 flex items-center justify-center bg-black text-white">Loading…</main>;
  if (!item) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center text-white">
        <p>{mine ? "You have no status updates right now." : "This status has gone."}</p>
        <Link href={mine ? "/status/new" : "/"} className="btn">{mine ? "Add a status" : "Back to chats"}</Link>
      </main>
    );
  }
  const p = opened?.ok && opened.payload.t === "status" ? opened.payload : null;
  const name = mine ? "My status" : person!.name;
  const views = mine ? (feed.mine[i]?.views ?? []) : [];

  return (
    <main className="fixed inset-0 z-50 flex flex-col bg-black text-white" aria-label={`${name}: status ${i + 1} of ${items.length}`} data-status-viewer>
      <div className="flex gap-1 px-2 pt-[max(.5rem,env(safe-area-inset-top))]" aria-hidden>
        {items.map((x, k) => <span key={x.id} className={`h-0.5 flex-1 rounded ${k <= i ? "bg-white" : "bg-white/35"}`} />)}
      </div>
      <header className="flex items-center gap-2 px-2 py-2">
        <Link href="/" className="icon-btn text-white" aria-label="Close status"><IconBack /></Link>
        <Avatar name={name} seed={owner} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{name}</h1>
          <p className="text-xs text-white/75">{dayLabel(item.created_at)}, {clock(item.created_at)}</p>
        </div>
        <button className="icon-btn text-white" onClick={() => setPaused((x) => !x)} aria-label={paused ? "Play" : "Pause"} aria-pressed={paused}>{paused ? "▶" : "❚❚"}</button>
        {mine && (
          <button className="icon-btn text-white" aria-label="Delete this status" onClick={async () => {
            if (!confirm("Delete this status update?")) return;
            await apiSend(`/api/status/${item.id}`, "DELETE").catch(() => undefined);
            await load();
            setI(0);
          }}><IconTrash /></button>
        )}
      </header>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <button className="absolute inset-y-0 left-0 z-10 w-1/3" aria-label="Previous" onClick={() => setI(Math.max(0, i - 1))} />
        <button className="absolute inset-y-0 right-0 z-10 w-2/3" aria-label="Next" onClick={next} />
        <StatusBody p={p} opened={opened} />
      </div>
      {mine ? (
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <button className="w-full py-2 text-center text-sm font-semibold" onClick={() => setShowViews((x) => !x)} data-status-views>
            👁 {views.length} {views.length === 1 ? "view" : "views"}
          </button>
          {showViews && (
            <ul className="max-h-48 overflow-y-auto rounded-xl bg-white/10 p-2 text-sm">
              {views.length === 0 && <li className="p-2 text-white/75">No views yet.</li>}
              {views.map((v, k) => <li key={k} className="flex justify-between p-2"><span>{v.name}</span><span className="text-white/75">{clock(v.at)}</span></li>)}
            </ul>
          )}
        </div>
      ) : (
        <form className="flex items-center gap-2 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2" onSubmit={async (e) => {
          e.preventDefault();
          const text = reply.trim();
          if (!text || !person) return;
          setReply("");
          try {
            await sendEncrypted(person.chat_id, personId, { t: "text", text, re: { id: item.id, name: `${person.name.split(" ")[0]} · Status`, text: p ? p.text || p.caption || "📷 Photo" : "Status" } });
            setSent("Reply sent");
          } catch (err) {
            setSent((err as Error).message);
          }
        }}>
          <input className="field flex-1 border-white/30 bg-white/10 py-2 text-white placeholder:text-white/60" placeholder="Reply" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply to this status" />
          <button className="btn h-11 w-11 shrink-0 rounded-full p-0" disabled={!reply.trim()} aria-label="Send reply"><IconSend size={20} /></button>
        </form>
      )}
      {sent && <p role="status" className="absolute inset-x-0 bottom-20 mx-auto w-fit rounded-full bg-white px-4 py-1.5 text-sm text-black">{sent}</p>}
    </main>
  );
}

function useStatusOpened(owner: string, me: string, cipher: string | null): Opened | null {
  const [o, setO] = useState<Opened | null>(null);
  useEffect(() => {
    let live = true;
    if (cipher) openMessage(`status:${owner}`, me, cipher, owner).then((x) => live && setO(x));
    return () => { live = false; };
  }, [owner, me, cipher]);
  return cipher ? o : null;
}

function StatusBody({ p, opened }: { p: Extract<Payload, { t: "status" }> | null; opened: Opened | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (p?.path && p.key && p.iv) mediaUrl(p.path, p.key, p.iv, p.mime ?? "image/jpeg").then((u) => live && setUrl(u), () => undefined);
    return () => { live = false; };
  }, [p?.path, p?.key, p?.iv, p?.mime]);
  if (!opened) return <p className="text-white/75">Decrypting…</p>;
  if (!p) return <p className="px-6 text-center text-white/75">This status couldn&apos;t be opened on this phone.</p>;
  if (p.path) {
    return (
      <figure className="flex h-full w-full flex-col items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={p.caption || "Status photo"} className="max-h-full max-w-full object-contain" /> : <span className="text-white/75">Loading photo…</span>}
        {p.caption && <figcaption className="absolute bottom-4 mx-4 rounded-lg bg-black/55 px-3 py-2 text-center">{p.caption}</figcaption>}
      </figure>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center p-8" style={{ background: p.bg ?? STATUS_COLOURS[0] }} data-status-text>
      <p className="display max-w-md whitespace-pre-wrap text-center text-3xl leading-snug">{p.text}</p>
    </div>
  );
}

/** New status: words on a colour, or a photo with a caption. */
export function StatusComposer({ personId }: { personId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [bg, setBg] = useState(STATUS_COLOURS[0]);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function post() {
    setBusy(true);
    setError(null);
    try {
      if (photo) {
        const up = await uploadStatusPhoto(photo.blob);
        await postStatus(personId, { t: "status", ...up, mime: "image/jpeg", ...(caption.trim() ? { caption: caption.trim() } : {}) }, up.path);
      } else {
        await postStatus(personId, { t: "status", text: text.trim(), bg });
      }
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 z-50 flex flex-col text-white" style={{ background: photo ? "#000" : bg }} data-status-composer>
      <header className="flex items-center gap-2 px-2 pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="icon-btn text-white" aria-label="Cancel"><IconClose /></Link>
        <h1 className="flex-1 font-semibold">New status</h1>
        {!photo && (
          <div className="flex gap-1.5" role="radiogroup" aria-label="Background colour">
            {STATUS_COLOURS.map((c) => (
              <button key={c} role="radio" aria-checked={bg === c} aria-label={`Colour ${STATUS_COLOURS.indexOf(c) + 1}`} onClick={() => setBg(c)}
                className={`h-7 w-7 rounded-full border-2 ${bg === c ? "border-white" : "border-white/40"}`} style={{ background: c }} />
            ))}
          </div>
        )}
        <button className="icon-btn text-white" onClick={() => fileRef.current?.click()} aria-label="Choose a photo"><IconImage /></button>
      </header>
      {error && <p role="alert" className="mx-4 rounded-lg bg-white px-3 py-2 text-sm text-black">{error}</p>}
      <div className="flex flex-1 items-center justify-center p-6">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="Your status photo" className="max-h-full max-w-full object-contain" />
        ) : (
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={700} placeholder="Type a status"
            className="display h-full w-full resize-none bg-transparent text-center text-3xl leading-snug text-white outline-none placeholder:text-white/60" aria-label="Status text" />
        )}
      </div>
      <div className="flex items-center gap-2 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        {photo ? <input className="field flex-1 border-white/30 bg-white/10 py-2 text-white placeholder:text-white/60" placeholder="Add a caption…" value={caption} onChange={(e) => setCaption(e.target.value)} aria-label="Caption" maxLength={300} />
          : <p className="flex-1 text-xs text-white/80">Your contacts on Afriheart (people you chat with one-to-one) can see it for 24 hours. End-to-end encrypted.</p>}
        <button className="btn h-12 w-12 shrink-0 rounded-full bg-white p-0 text-black" disabled={busy || (!photo && !text.trim())} onClick={post} aria-label="Post status"><IconSend size={20} /></button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-hidden tabIndex={-1} data-status-photo onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        try {
          const blob = await shrink(f);
          setPhoto({ blob, url: URL.createObjectURL(blob) });
        } catch {
          setError("Couldn't open that photo.");
        }
      }} />
    </main>
  );
}
