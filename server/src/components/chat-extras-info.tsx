"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ThreadData } from "@/lib/chat";
import { apiSend } from "@/lib/client";
import { mediaUrl } from "@/lib/e2e-device";
import { ChatThemePicker } from "./chat-theme";
import { useHistory, type OpenedItem } from "./thread-search";
import { fileSize } from "./sealed";
import { IconDownload, IconFile, IconLink, IconMute, IconStar, IconTimer } from "./icons";

type Chat = ThreadData["chat"];
const TIMERS: [number, string][] = [[0, "Off"], [86400, "24 hours"], [604800, "7 days"], [7776000, "90 days"]];

/** Mute, disappearing messages, wallpaper, media, export and clear: the WhatsApp-style chat settings. */
export function ChatSettings({ chatId, me, chat, onError }: { chatId: string; me: string; chat: Chat; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [muteOpen, setMuteOpen] = useState(false);
  const [timer, setTimer] = useState(chat.disappear_secs ?? 0);
  const [muted, setMuted] = useState(chat.muted);

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const row = "flex min-h-12 w-full items-center gap-3 text-left";
  return (
    <>
      <section aria-labelledby="sec-media" className="card mb-4" id="media">
        <h2 id="sec-media" className="mb-2 font-semibold">Media, links and docs</h2>
        <MediaGallery chatId={chatId} me={me} />
      </section>

      <section aria-label="Chat settings" className="card mb-4 flex flex-col divide-y divide-line/70">
        <div className="py-1">
          <button className={row} onClick={() => (muted ? (setMuted(false), run(() => apiSend(`/api/chats/${chatId}/prefs`, "POST", { mute: "off" }))) : setMuteOpen((x) => !x))} aria-expanded={muteOpen}>
            <IconMute className="text-muted" /> <span className="flex-1">{muted ? "Unmute notifications" : "Mute notifications"}</span>
            {muted && <span className="text-sm text-muted">Muted</span>}
          </button>
          {muteOpen && !muted && (
            <div className="flex flex-wrap gap-2 pb-2 pl-9">
              {[["8h", "8 hours"], ["week", "1 week"], ["always", "Always"]].map(([v, l]) => (
                <button key={v} className="chip min-h-11" onClick={() => { setMuteOpen(false); setMuted(true); run(() => apiSend(`/api/chats/${chatId}/prefs`, "POST", { mute: v })); }}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div className="py-2" id="disappearing">
          <p className="flex items-center gap-3"><IconTimer className="text-muted" /> <span className="flex-1">Disappearing messages</span></p>
          <p className="mb-2 pl-9 text-xs text-muted">New messages disappear after the time you choose. {chat.can_edit_info ? "" : "Only admins can change this."}</p>
          <div className="flex flex-wrap gap-2 pl-9" role="radiogroup" aria-label="Disappearing messages">
            {TIMERS.map(([secs, label]) => (
              <button key={secs} role="radio" aria-checked={timer === secs} disabled={!chat.can_edit_info}
                className={`chip min-h-11 ${timer === secs ? "border-accent bg-accent-soft font-semibold text-accent" : ""}`}
                onClick={() => { const before = timer; setTimer(secs); run(() => apiSend(`/api/chats/${chatId}/settings`, "POST", { disappear_secs: secs }).catch((e) => { setTimer(before); throw e; })); }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="py-2" id="theme">
          <p className="mb-2 font-semibold">Chat theme</p>
          <ChatThemePicker chatId={chatId} />
        </div>
        <Link href="/starred" className={`${row} py-1`}><IconStar className="text-muted" /> Starred messages</Link>
        <ExportChat chatId={chatId} me={me} title={chat.title} />
        <button className={`${row} py-1 text-danger`} onClick={() => {
          if (!confirm("Clear this chat? Its messages are removed from your phones. Others in the chat keep theirs.")) return;
          run(() => apiSend(`/api/chats/${chatId}/clear`, "POST"));
        }}>Clear chat</button>
      </section>
    </>
  );
}

function MediaGallery({ chatId, me }: { chatId: string; me: string }) {
  const { items, error } = useHistory(chatId, me);
  const [tab, setTab] = useState<"media" | "docs" | "links">("media");
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!items) return <p className="text-sm text-muted">Opening on this phone…</p>;
  const media = items.filter((m) => (m.payload.t === "image" && !m.payload.once) || (m.payload.t === "file" && m.payload.mime.startsWith("video/"))).reverse();
  const docs = items.filter((m) => m.payload.t === "file" && !m.payload.mime.startsWith("video/")).reverse();
  const links = items.flatMap((m) => (m.payload.t === "text" ? [...m.text.matchAll(/https?:\/\/[^\s<]+[^\s<.,;:!?)"']/g)].map((x) => ({ m, url: x[0] })) : [])).reverse();
  const tabBtn = (t: typeof tab, label: string, n: number) => (
    <button role="tab" aria-selected={tab === t} className={`chip min-h-9 ${tab === t ? "border-accent bg-accent-soft font-semibold text-accent" : ""}`} onClick={() => setTab(t)}>{label} {n ? `(${n})` : ""}</button>
  );
  return (
    <div data-media-gallery>
      <div role="tablist" className="mb-3 flex gap-2">{tabBtn("media", "Media", media.length)}{tabBtn("docs", "Docs", docs.length)}{tabBtn("links", "Links", links.length)}</div>
      {tab === "media" && (media.length ? <div className="grid grid-cols-3 gap-1">{media.slice(0, 60).map((m) => <Thumb key={m.id} m={m} />)}</div> : <p className="text-sm text-muted">No photos or videos yet.</p>)}
      {tab === "docs" && (docs.length ? <ul className="flex flex-col gap-1">{docs.map((m) => <DocRow key={m.id} m={m} />)}</ul> : <p className="text-sm text-muted">No documents yet.</p>)}
      {tab === "links" && (links.length ? (
        <ul className="flex flex-col gap-1">{links.slice(0, 100).map(({ m, url }, i) => (
          <li key={`${m.id}-${i}`}><a href={url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-h-11 items-center gap-2 break-all text-sm text-accent underline"><IconLink size={16} className="shrink-0" />{url}</a></li>
        ))}</ul>
      ) : <p className="text-sm text-muted">No links yet.</p>)}
    </div>
  );
}

function Thumb({ m }: { m: OpenedItem }) {
  const p = m.payload as { path: string; key: string; iv: string; mime: string };
  const [url, setUrl] = useState<string | null>(null);
  const video = p.mime.startsWith("video/");
  useEffect(() => {
    if (video) return;
    let live = true;
    mediaUrl(p.path, p.key, p.iv, p.mime).then((u) => live && setUrl(u), () => undefined);
    return () => { live = false; };
  }, [p.path, p.key, p.iv, p.mime, video]);
  return (
    <a href={`/chats/${"" /* stays on this page */}`} onClick={async (e) => { e.preventDefault(); window.open(await mediaUrl(p.path, p.key, p.iv, p.mime), "_blank"); }}
      className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-line/60 text-xs" aria-label={video ? "Video" : "Photo"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {video ? <span className="text-2xl">▶</span> : url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
    </a>
  );
}

function DocRow({ m }: { m: OpenedItem }) {
  const p = m.payload as { path: string; key: string; iv: string; mime: string; name: string; size: number };
  return (
    <li>
      <button className="flex min-h-12 w-full items-center gap-3 text-left" onClick={async () => {
        const a = document.createElement("a");
        a.href = await mediaUrl(p.path, p.key, p.iv, p.mime);
        a.download = p.name;
        a.click();
      }}>
        <IconFile className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span><span className="block text-xs text-muted">{fileSize(p.size)}</span></span>
        <IconDownload size={18} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

/** A .txt of the chat, made on this phone (Afriheart can't read it). */
export function ExportChat({ chatId, me, title }: { chatId: string; me: string; title: string }) {
  const [go, setGo] = useState(false);
  return go ? <ExportRunner chatId={chatId} me={me} title={title} onDone={() => setGo(false)} /> : (
    <button className="flex min-h-12 w-full items-center gap-3 py-1 text-left" onClick={() => setGo(true)}><IconDownload className="text-muted" /> Export chat</button>
  );
}

export function ExportRunner({ chatId, me, title, onDone }: { chatId: string; me: string; title: string; onDone: () => void }) {
  const { items, error } = useHistory(chatId, me);
  useEffect(() => {
    if (!items) return;
    const lines = items.map((m) => {
      const d = new Date(m.created_at);
      const when = `${d.toLocaleDateString("en-ZA")}, ${d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`;
      return `[${when}] ${m.sender_id === me ? "You" : m.sender_name ?? "Afriheart"}: ${m.text}`;
    });
    const blob = new Blob([`Afriheart chat with ${title}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Afriheart chat - ${title.replace(/[\\/:*?"<>|]/g, "")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onDone();
  }, [items, me, title, onDone]);
  return <p className="flex min-h-12 items-center gap-3 py-1 text-sm text-muted">{error ?? "Preparing your chat…"}</p>;
}

/** Group name, description, permissions, invite link and admin tools. */
export function GroupAdmin({ chatId, me, chat, members, onError }: { chatId: string; me: string; chat: Chat; members: ThreadData["members"]; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [name, setName] = useState(chat.title);
  const [description, setDescription] = useState(chat.description);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [perms, setPerms] = useState({ admins_only_send: chat.admins_only_send, admins_only_info: chat.admins_only_info });
  function setPerm(k: keyof typeof perms, v: boolean) {
    const before = perms;
    setPerms({ ...perms, [k]: v });
    run(() => apiSend(`/api/chats/${chatId}/settings`, "POST", { [k]: v }).catch((e) => { setPerms(before); throw e; }));
  }

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  const changed = name.trim() !== chat.title || description.trim() !== chat.description;
  return (
    <>
      <section aria-labelledby="sec-about" className="card mb-4 flex flex-col gap-2">
        <h2 id="sec-about" className="font-semibold">About this group</h2>
        {chat.can_edit_info ? (
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); run(() => apiSend(`/api/chats/${chatId}/settings`, "POST", { name, description })); }}>
            <label className="text-sm font-semibold" htmlFor="g-name">Group name</label>
            <input id="g-name" className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <label className="text-sm font-semibold" htmlFor="g-desc">Description</label>
            <textarea id="g-desc" className="field min-h-20" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group for?" />
            <button className="btn btn-sm self-start" disabled={!changed || !name.trim()}>Save</button>
          </form>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{chat.description || <span className="text-muted">No description.</span>}</p>
        )}
      </section>

      {chat.is_admin && (
        <section aria-labelledby="sec-admin" className="card mb-4 flex flex-col gap-3">
          <h2 id="sec-admin" className="font-semibold">Group settings (admins)</h2>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span><span className="block">Only admins can send messages</span><span className="block text-xs text-muted">Good for announcements.</span></span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={perms.admins_only_send} onChange={(e) => setPerm("admins_only_send", e.target.checked)} />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span><span className="block">Only admins can edit group settings</span><span className="block text-xs text-muted">Name, description and disappearing messages.</span></span>
            <input type="checkbox" className="h-6 w-6 accent-[var(--accent)]" checked={perms.admins_only_info} onChange={(e) => setPerm("admins_only_info", e.target.checked)} />
          </label>
          <div className="flex flex-col gap-2" data-invite>
            <p className="flex items-center gap-2"><IconLink className="text-muted" /> Invite to group with a link</p>
            {link ? (
              <>
                <p className="break-all rounded-lg bg-paper px-3 py-2 font-mono text-sm" data-invite-link>{link}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-sm" onClick={async () => {
                    if (navigator.share) await navigator.share({ title: chat.title, text: `Join "${chat.title}" on Afriheart`, url: link }).catch(() => undefined);
                    else { await navigator.clipboard?.writeText(link).catch(() => undefined); setCopied(true); }
                  }}>{copied ? "Copied" : "Share link"}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    if (!confirm("Reset the link? The old one stops working.")) return;
                    run(async () => { const r = await apiSend<{ token: string }>(`/api/chats/${chatId}/invite`, "POST", { reset: true }); setLink(`${location.origin}/join/${r.token}`); });
                  }}>Reset link</button>
                </div>
                <p className="text-xs text-muted">Anyone with this link can join. Only share it with people you trust.</p>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm self-start" onClick={() => run(async () => { const r = await apiSend<{ token: string }>(`/api/chats/${chatId}/invite`, "POST", {}); setLink(`${location.origin}/join/${r.token}`); })}>Show invite link</button>
            )}
          </div>
        </section>
      )}
      <MemberActions chatId={chatId} me={me} isAdmin={chat.is_admin} members={members} run={run} />
    </>
  );
}

function MemberActions({ chatId, me, isAdmin, members, run }: { chatId: string; me: string; isAdmin: boolean; members: ThreadData["members"]; run: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!isAdmin) return null;
  const others = members.filter((m) => m.id !== me);
  if (!others.length) return null;
  return (
    <section aria-labelledby="sec-manage" className="card mb-4">
      <h2 id="sec-manage" className="mb-2 font-semibold">Manage people</h2>
      <ul className="flex flex-col">
        {others.map((p) => (
          <li key={p.id} className="border-b border-line/70 py-1 last:border-0">
            <button className="flex min-h-11 w-full items-center justify-between text-left" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span>{p.name}</span>{p.role === "admin" && <span className="status status-done">Admin</span>}
            </button>
            {open === p.id && (
              <div className="flex flex-wrap gap-2 pb-2">
                <button className="btn btn-ghost btn-sm" onClick={() => run(() => apiSend(`/api/chats/${chatId}/members/${p.id}`, "POST", { action: p.role === "admin" ? "unadmin" : "admin" }))}>{p.role === "admin" ? "Dismiss as admin" : "Make group admin"}</button>
                <button className="btn btn-ghost btn-sm text-danger" onClick={() => { if (confirm(`Remove ${p.name} from the group?`)) run(() => apiSend(`/api/chats/${chatId}/members/${p.id}`, "POST", { action: "remove" })); }}>Remove {p.name.split(" ")[0]}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
