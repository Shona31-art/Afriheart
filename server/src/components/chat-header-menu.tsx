"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ThreadData } from "@/lib/chat";
import { apiGet, apiSend } from "@/lib/client";
import { ChatThemePicker } from "./chat-theme";
import { ExportRunner } from "./chat-extras-info";
import { IconBack } from "./icons";

type List = { id: string; name: string; chat_ids: string[] };

/**
 * The ⋮ menu in a chat's header, in WhatsApp's order: View contact, Search, Media, links and docs,
 * Mute notifications, Disappearing messages, Chat theme, then More (Report, Block, Clear chat,
 * Export chat, Add to list), plus New group with this person.
 */
export function ChatHeaderMenu({ chatId, me, chat, members, onSearch, onReport, onToast, onChanged }: {
  chatId: string; me: string; chat: ThreadData["chat"]; members: ThreadData["members"];
  onSearch: () => void; onReport: () => void; onToast: (t: string) => void; onChanged: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<null | "menu" | "more" | "mute" | "theme" | "lists" | "export">(null);
  const isGroup = chat.kind === "group";
  const other = members.find((m) => m.id !== me);
  const close = () => setView(null);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setView(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  async function act(fn: () => Promise<unknown>, done?: string) {
    close();
    try {
      await fn();
      if (done) onToast(done);
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  const item = "flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[15px] hover:bg-line/30 active:bg-line/50";
  const go = (href: string) => { close(); router.push(href); };

  return (
    <>
      <button className="icon-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={view !== null} onClick={() => setView(view ? null : "menu")} data-chat-menu-button>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="5" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="19" r="1.9" fill="currentColor" /></svg>
      </button>
      {view && (
        <div className="fixed inset-0 z-50" onClick={close}>
          {(view === "menu" || view === "more") && (
            <div role="menu" aria-label={view === "more" ? "More" : "Chat options"} onClick={(e) => e.stopPropagation()} data-header-menu
              className="absolute right-2 top-[max(.5rem,env(safe-area-inset-top))] w-64 overflow-hidden rounded-2xl bg-card py-1 text-ink shadow-xl ring-1 ring-line">
              {view === "menu" ? (
                <>
                  <button role="menuitem" className={item} onClick={() => go(`/chats/${chatId}/info`)}>{isGroup ? "Group info" : chat.is_match ? "View profile" : "View contact"}</button>
                  <button role="menuitem" className={item} onClick={() => { close(); onSearch(); }}>Search</button>
                  <button role="menuitem" className={item} onClick={() => go(`/chats/${chatId}/info#media`)}>Media, links and docs</button>
                  <button role="menuitem" className={item} onClick={() => (chat.muted ? act(() => apiSend(`/api/chats/${chatId}/prefs`, "POST", { mute: "off" }), "Notifications on") : setView("mute"))}>{chat.muted ? "Unmute notifications" : "Mute notifications"}</button>
                  <button role="menuitem" className={item} onClick={() => go(`/chats/${chatId}/info#disappearing`)}>Disappearing messages</button>
                  <button role="menuitem" className={item} onClick={() => setView("theme")}>Chat theme</button>
                  <div className="my-1 border-t border-line" />
                  <button role="menuitem" className={item} onClick={() => setView("more")}>More <span aria-hidden>›</span></button>
                </>
              ) : (
                <>
                  <button role="menuitem" className={`${item} text-muted`} onClick={() => setView("menu")}><span className="flex items-center gap-2"><IconBack size={18} /> Back</span></button>
                  {!isGroup && other && <button role="menuitem" className={item} onClick={() => { close(); onReport(); }}>Report</button>}
                  {!isGroup && other && <button role="menuitem" className={item} onClick={() => {
                    if (!confirm(`Block ${other.name.split(" ")[0]}? They won't be able to message or call you.`)) return;
                    act(() => apiSend("/api/dating/block", "POST", { person_id: other.id }).then(() => router.replace("/")), "Blocked");
                  }}>Block</button>}
                  <button role="menuitem" className={item} onClick={() => {
                    if (!confirm("Clear this chat? Its messages are removed from your phones. Others keep theirs.")) return;
                    act(() => apiSend(`/api/chats/${chatId}/clear`, "POST"), "Chat cleared");
                  }}>Clear chat</button>
                  <button role="menuitem" className={item} onClick={() => setView("export")}>Export chat</button>
                  <button role="menuitem" className={item} onClick={() => setView("lists")}>Add to list</button>
                  {!isGroup && !chat.is_match && other?.phone && <button role="menuitem" className={item} onClick={() => go(`/chats/new?group=${encodeURIComponent(other.phone)}`)}>New group with {other.name.split(" ")[0]}</button>}
                  {isGroup && <button role="menuitem" className={`${item} text-danger`} onClick={() => {
                    if (!confirm(`Exit "${chat.title}"? You'll stop getting its messages.`)) return;
                    act(() => apiSend(`/api/chats/${chatId}/members`, "DELETE").then(() => router.replace("/")));
                  }}>Exit group</button>}
                </>
              )}
            </div>
          )}
          {view === "mute" && (
            <Sheet title="Mute notifications for…" onClose={close}>
              {[["8h", "8 hours"], ["week", "1 week"], ["always", "Always"]].map(([v, l]) => (
                <button key={v} className={item} onClick={() => act(() => apiSend(`/api/chats/${chatId}/prefs`, "POST", { mute: v }), "Muted")}>{l}</button>
              ))}
            </Sheet>
          )}
          {view === "theme" && <Sheet title="Chat theme" onClose={close}><div className="px-4 pb-2"><ChatThemePicker chatId={chatId} /></div></Sheet>}
          {view === "lists" && <Sheet title="Add to list" onClose={close}><ListPicker chatId={chatId} onToast={onToast} onDone={close} /></Sheet>}
          {view === "export" && <Sheet title="Export chat" onClose={close}><div className="px-4"><ExportRunner chatId={chatId} me={me} title={chat.title} onDone={() => { close(); onToast("Chat exported"); }} /></div></Sheet>}
        </div>
      )}
    </>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="absolute inset-0 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-ink" onClick={(e) => e.stopPropagation()}>
        <h2 className="px-4 pb-2 font-semibold">{title}</h2>
        {children}
        <button className="mx-4 mt-2 min-h-11 text-sm font-semibold underline" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/** Tick the lists this chat belongs to, or make a new one. */
export function ListPicker({ chatId, onToast, onDone }: { chatId: string; onToast: (t: string) => void; onDone: () => void }) {
  const [lists, setLists] = useState<List[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiGet<List[]>("/api/lists").then(setLists).catch(() => setError("Couldn't load your lists.")); }, []);
  async function toggle(l: List, on: boolean) {
    setError(null);
    try {
      const next = await apiSend<List>(`/api/lists/${l.id}`, "POST", on ? { add: chatId } : { remove: chatId });
      setLists((x) => x?.map((y) => (y.id === l.id ? next : y)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="flex flex-col gap-1 px-4" data-list-picker>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {lists?.length === 0 && <p className="text-sm text-muted">No lists yet. Make one for family, work or your braai crew: it shows as a filter above your chats.</p>}
      {lists?.map((l) => (
        <label key={l.id} className="flex min-h-12 items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={l.chat_ids.includes(chatId)} onChange={(e) => toggle(l, e.target.checked)} />
          {l.name}
        </label>
      ))}
      <form className="mt-2 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const l = await apiSend<List>("/api/lists", "POST", { name, chat_id: chatId });
          setLists((x) => [...(x ?? []), l]);
          setName("");
          onToast(`Added to ${l.name}`);
        } catch (err) {
          setError((err as Error).message);
        }
      }}>
        <label className="sr-only" htmlFor="new-list">New list name</label>
        <input id="new-list" className="field py-2" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="New list, e.g. Family" />
        <button className="btn btn-sm" disabled={!name.trim()}>Create</button>
      </form>
      <button type="button" className="sr-only" onClick={onDone}>Close</button>
    </div>
  );
}
