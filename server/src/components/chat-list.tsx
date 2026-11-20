"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { apiGet, apiSend, listTime } from "@/lib/client";
import { backupPoll, useLive, useTyping } from "@/lib/live";
import { payloadText } from "@/lib/chat-meta";
import { Avatar } from "./avatar";
import { useOpened } from "./sealed";
import { IconArchive, IconBack, IconMore, IconMute, IconPushPin, IconStar, IconTrash, IconUnread } from "./icons";
import { StatusStrip } from "./status";

export interface ChatSummary {
  id: string;
  kind: "direct" | "group";
  title: string;
  subtitle: string;
  last_message_at: string;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  marked_unread: boolean;
  last_cipher: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
}

type Filter = "all" | "unread" | "groups" | `list:${string}`;
type List = { id: string; name: string; chat_ids: string[] };

/** initial = null: load straight away (the computer sidebar). */
export function ChatList({ initial, personId }: { initial: ChatSummary[] | null; personId: string }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(initial);
  const path = usePathname();
  const firstDelay = initial ? 1000 : 0; // catch up once just after opening
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [archivedView, setArchivedView] = useState(false);
  const [menu, setMenu] = useState<ChatSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typing = useTyping();
  const [lists, setLists] = useState<List[]>([]);
  useEffect(() => { apiGet<List[]>("/api/lists").then(setLists).catch(() => undefined); }, [chats?.length]);

  // New messages reorder the list as soon as a realtime nudge arrives; a slow poll is the backup.
  const kick = useRef<() => void>(() => {});
  const isLive = useLive((n) => { if (n.chat || n.resync) kick.current(); });
  const liveRef = useRef(isLive);
  useEffect(() => { liveRef.current = isLive; }, [isLive]);
  useEffect(() => {
    let stop = false;
    let busy = false;
    let again = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      clearTimeout(t);
      if (busy) { again = true; return; }
      busy = true;
      try {
        const data = await apiGet<ChatSummary[]>("/api/chats");
        if (!stop) setChats(data);
      } catch {
        // keep what we have
      }
      busy = false;
      if (stop) return;
      if (again) { again = false; tick(); return; }
      t = setTimeout(tick, document.hidden ? Math.max(10000, backupPoll(liveRef.current, 3000)) : backupPoll(liveRef.current, 3000));
    };
    kick.current = tick;
    t = setTimeout(tick, firstDelay);
    return () => {
      stop = true;
      kick.current = () => {};
      clearTimeout(t);
    };
  }, [firstDelay]);

  async function prefs(c: ChatSummary, body: Record<string, unknown>) {
    setMenu(null);
    setError(null);
    try {
      await apiSend(`/api/chats/${c.id}/prefs`, "POST", body);
    } catch (e) {
      setError((e as Error).message);
    }
    kick.current();
  }

  async function deleteChat(c: ChatSummary) {
    setMenu(null);
    if (!confirm(`Delete this chat with ${c.title}? Its messages are removed from your phones. ${c.title.split(" ")[0]} keeps theirs.`)) return;
    await apiSend(`/api/chats/${c.id}/clear`, "POST", { delete: true }).catch((e) => setError((e as Error).message));
    kick.current();
  }

  if (!chats) return <p className="px-4 py-6 text-sm text-muted">Loading chats…</p>;
  const archived = chats.filter((c) => c.archived);
  const base = archivedView ? archived : chats.filter((c) => !c.archived);
  const shown = base
    .filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => {
      if (filter === "all") return true;
      if (filter === "unread") return c.unread > 0 || c.marked_unread;
      if (filter === "groups") return c.kind === "group";
      return lists.find((l) => `list:${l.id}` === filter)?.chat_ids.includes(c.id) ?? false;
    });
  const unreadArchived = archived.filter((c) => c.unread > 0 && !c.muted).length;

  if (chats.length === 0) {
    return (
      <>
        <StatusStrip personId={personId} />
        <div className="mx-4 mt-6 card">
          <p className="font-semibold">No chats yet</p>
          <p className="mb-4 text-sm text-muted">Message a friend by their number, or start a group for the people you make plans with.</p>
          <Link href="/chats/new" className="btn btn-sm">Start a chat</Link>
        </div>
      </>
    );
  }
  return (
    <>
      {archivedView ? (
        <div className="flex items-center gap-1 px-2 pb-2">
          <button className="icon-btn" onClick={() => setArchivedView(false)} aria-label="Back to chats"><IconBack /></button>
          <h2 className="font-semibold">Archived</h2>
        </div>
      ) : (
        <>
          <StatusStrip personId={personId} />
          <div className="px-4 pb-2">
            <input className="field py-2 text-sm" type="search" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label="Show">
            {(["all", "unread", "groups"] as Filter[]).map((f) => (
              <button key={f} className={`chip min-h-9 shrink-0 ${filter === f ? "border-accent bg-accent-soft font-semibold text-accent" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "unread" ? "Unread" : "Groups"}
              </button>
            ))}
            {lists.map((l) => (
              <button key={l.id} className={`chip min-h-9 shrink-0 ${filter === `list:${l.id}` ? "border-accent bg-accent-soft font-semibold text-accent" : ""}`} aria-pressed={filter === `list:${l.id}`} onClick={() => setFilter(`list:${l.id}`)} data-list-filter>{l.name}</button>
            ))}
            <Link href="/starred" className="chip min-h-9 shrink-0"><IconStar size={16} /> Starred</Link>
          </div>
          {archived.length > 0 && (
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-line/40" onClick={() => setArchivedView(true)} data-archived-row>
              <span className="flex h-[50px] w-[50px] items-center justify-center text-muted"><IconArchive /></span>
              <span className="flex-1 font-semibold">Archived</span>
              <span className="text-xs font-semibold text-accent">{unreadArchived || archived.length}</span>
            </button>
          )}
        </>
      )}
      {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">{error}</p>}
      {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{filter === "unread" ? "No unread chats." : filter === "groups" ? "No groups yet." : filter.startsWith("list:") ? "No chats in this list yet. Open a chat, tap ⋮, then More and Add to list." : archivedView ? "No archived chats." : "No chats match."}</p>}
      <ul className="flex flex-col">
        {shown.map((c) => {
          const typers = (typing[c.id] ?? []).filter((t) => t.who !== personId);
          const unread = c.unread > 0 || c.marked_unread;
          return (
            <li key={c.id} className="group relative" onContextMenu={(e) => { e.preventDefault(); setMenu(c); }}>
              <Link href={`/chats/${c.id}`} aria-current={path.startsWith(`/chats/${c.id}`) ? "page" : undefined} {...longPress(() => setMenu(c))}
                className={`flex items-center gap-3 px-4 py-2.5 active:bg-line/40 ${path.startsWith(`/chats/${c.id}`) ? "bg-accent-soft" : ""}`} data-chat-row={c.id}>
                <Avatar name={c.title} seed={c.id} group={c.kind === "group"} size={50} />
                <div className="min-w-0 flex-1 border-b border-line/70 pb-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{c.title}</p>
                    <span className={`shrink-0 text-xs ${unread ? "font-semibold text-accent" : "text-muted"}`}>{listTime(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {typers.length ? <p className="truncate text-sm font-semibold text-accent">typing…</p> : <Preview chat={c} personId={personId} />}
                    <span className="flex shrink-0 items-center gap-1 text-muted">
                      {c.muted && <IconMute size={16} aria-label="Muted" />}
                      {c.pinned && <IconPushPin size={16} aria-label="Pinned" data-pinned />}
                      {unread && (
                        <span className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 ${c.muted ? "bg-line text-ink" : "bg-accent text-accent-ink"}`} data-unread>
                          {c.unread > 0 ? c.unread : <span className="sr-only">Marked unread</span>}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </Link>
              <button className="absolute right-1 top-1 hidden rounded-full bg-card p-1.5 shadow group-hover:block focus:block" onClick={() => setMenu(c)} aria-label={`Options for ${c.title}`}><IconMore size={18} /></button>
            </li>
          );
        })}
      </ul>
      {menu && <ChatMenu c={menu} onClose={() => setMenu(null)} onPrefs={(b) => prefs(menu, b)} onDelete={() => deleteChat(menu)} />}
    </>
  );
}

function longPress(fn: () => void) {
  let t: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  return {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === "mouse") return; fired = false; t = setTimeout(() => { fired = true; navigator.vibrate?.(15); fn(); }, 500); },
    onPointerUp: () => { if (t) clearTimeout(t); },
    onPointerMove: () => { if (t) clearTimeout(t); },
    onClick: (e: React.MouseEvent) => { if (fired) { e.preventDefault(); fired = false; } },
  };
}

function ChatMenu({ c, onClose, onPrefs, onDelete }: { c: ChatSummary; onClose: () => void; onPrefs: (b: Record<string, unknown>) => void; onDelete: () => void }) {
  const [muting, setMuting] = useState(false);
  const item = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-line/30 active:bg-line/50";
  return (
    <div role="dialog" aria-modal="true" aria-label={`${c.title}: options`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} data-chat-menu>
      <div className="w-full max-w-xl rounded-t-3xl bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <p className="px-3 py-2 font-semibold">{c.title}</p>
        {muting ? (
          <ul>
            <li className="px-3 pb-1 text-sm text-muted">Mute notifications for…</li>
            <li><button className={item} onClick={() => onPrefs({ mute: "8h" })}>8 hours</button></li>
            <li><button className={item} onClick={() => onPrefs({ mute: "week" })}>1 week</button></li>
            <li><button className={item} onClick={() => onPrefs({ mute: "always" })}>Always</button></li>
            <li><button className={item} onClick={() => setMuting(false)}>Cancel</button></li>
          </ul>
        ) : (
          <ul>
            {!c.archived && <li><button className={item} onClick={() => onPrefs({ pin: !c.pinned })}><IconPushPin /> {c.pinned ? "Unpin chat" : "Pin chat"}</button></li>}
            <li><button className={item} onClick={() => (c.muted ? onPrefs({ mute: "off" }) : setMuting(true))}><IconMute /> {c.muted ? "Unmute notifications" : "Mute notifications"}</button></li>
            <li><button className={item} onClick={() => onPrefs({ archive: !c.archived })}><IconArchive /> {c.archived ? "Unarchive chat" : "Archive chat"}</button></li>
            <li><button className={item} onClick={() => onPrefs({ unread: !(c.unread > 0 || c.marked_unread) })}><IconUnread /> {c.unread > 0 || c.marked_unread ? "Mark as read" : "Mark as unread"}</button></li>
            {c.kind === "direct" && <li><button className={`${item} text-danger`} onClick={onDelete}><IconTrash /> Delete chat</button></li>}
            <li><button className={item} onClick={onClose}>Cancel</button></li>
          </ul>
        )}
      </div>
    </div>
  );
}

/** The last message, decrypted on this phone for the preview. */
function Preview({ chat, personId }: { chat: ChatSummary; personId: string }) {
  const opened = useOpened(chat.id, personId, chat.last_cipher, chat.last_sender_id);
  let text = chat.subtitle;
  if (chat.last_cipher && opened?.ok) {
    const who = chat.last_sender_id === personId ? "You: " : chat.kind === "group" && chat.last_sender_name ? `${chat.last_sender_name.split(" ")[0]}: ` : "";
    text = who + payloadText(opened.payload);
  }
  return <p className="truncate text-sm text-muted">{text}</p>;
}
