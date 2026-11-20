"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, android, apiGet, apiSend } from "@/lib/client";
import { Avatar } from "./avatar";
import { useRingtone } from "./sounds";
import { myDevice, resendWaitingKeys } from "@/lib/e2e-device";
import { IconClose, IconLock, IconOffline, IconPhone, IconVideo } from "./icons";
import { backupPoll, useLive } from "@/lib/live";
import { startDataMeter } from "@/lib/data-light";

interface IncomingCall { id: string; kind: "voice" | "video"; title: string; chat_id: string; participants: { id: string; name: string }[] }
const UnreadContext = createContext(0);
export const useUnread = () => useContext(UnreadContext);
const MeContext = createContext<string | null>(null);
/** The signed-in person's id, once the first sync has answered (null when signed out). */
export const useMe = () => useContext(MeContext);

/**
 * Polls the server every few seconds for calls ringing for this person and the
 * unread count. Shows a full-screen ringing screen anywhere in the app.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [me, setMe] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [busy, setBusy] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const pathRef = useRef(path);
  const rekeying = useRef(false);
  const [online, setOnline] = useState(true);
  // Count the data Afriheart uses on this phone (shown on the You tab).
  useEffect(() => startDataMeter(), []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  // Calls ringing and the unread count: fetched as soon as a realtime nudge arrives,
  // with a slow backup poll (quick again if the live connection drops).
  const kick = useRef<() => void>(() => {});
  const isLive = useLive(() => kick.current());
  const liveRef = useRef(isLive);
  useEffect(() => { liveRef.current = isLive; }, [isLive]);
  useEffect(() => {
    let stop = false;
    let busy = false;
    let again = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      clearTimeout(timer);
      if (busy) { again = true; return; }
      busy = true;
      let wait = backupPoll(liveRef.current, 2500);
      try {
        const data = await apiGet<{ me: string; incoming: IncomingCall[]; unread: number; rekey: number }>("/api/sync");
        // Set up this phone's encryption keys straight after sign-in, so messages can be encrypted for it.
        myDevice(data.me).then(() => (data.rekey > 0 && !rekeying.current ? (rekeying.current = true, resendWaitingKeys(data.me).finally(() => (rekeying.current = false))) : null)).catch(() => undefined);
        setUnread(data.unread);
        setMe(data.me);
        android()?.setBadge(data.unread);
        document.title = data.unread ? `(${data.unread}) Afriheart` : "Afriheart";
        setIncoming(pathRef.current.startsWith("/call/") ? null : data.incoming[0] ?? null);
      } catch (e) {
        wait = e instanceof ApiError && e.status === 401 ? 4000 : 5000; // signed out: check rarely
        if (e instanceof ApiError && e.status === 401) setMe(null);
        setIncoming(null);
      }
      busy = false;
      if (stop) return;
      if (again) { again = false; tick(); return; }
      timer = setTimeout(tick, document.hidden ? Math.max(wait, 5000) : wait);
    };
    kick.current = tick;
    tick();
    return () => {
      stop = true;
      kick.current = () => {};
      clearTimeout(timer);
    };
  }, []);

  // Inside the Android app: tell the server where to ring this person's calls.
  useEffect(() => {
    const register = () => {
      const app = android();
      const token = app?.fcmToken();
      if (!app || !token) return;
      try {
        if (localStorage.getItem("common-android-token") === token) return;
      } catch {
        // no storage: register anyway
      }
      apiSend("/api/android/register", "POST", { token, version: app.version() })
        .then(() => { try { localStorage.setItem("common-android-token", token); } catch { /* fine */ } })
        .catch(() => undefined);
    };
    register();
    window.addEventListener("common-android-token", register);
    return () => window.removeEventListener("common-android-token", register);
  }, []);

  useRingtone(!!incoming && !busy);

  async function answer() {
    if (!incoming) return;
    setBusy(true);
    try {
      await apiSend(`/api/calls/${incoming.id}`, "POST", { action: "join" });
      router.push(`/call/${incoming.id}`);
      setIncoming(null);
    } catch {
      setIncoming(null);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!incoming) return;
    setBusy(true);
    await apiSend(`/api/calls/${incoming.id}`, "POST", { action: "decline" }).catch(() => undefined);
    setIncoming(null);
    setBusy(false);
  }

  return (
    <MeContext.Provider value={me}>
    <UnreadContext.Provider value={unread}>
      {!online && (
        <p role="status" className="fixed inset-x-0 top-0 z-40 flex items-center justify-center gap-2 bg-ink px-4 py-1.5 pt-[max(.375rem,env(safe-area-inset-top))] text-sm text-white">
          <IconOffline size={16} /> You&apos;re offline. Anything you couldn&apos;t send stays ready to send again.
        </p>
      )}
      {children}
      {incoming && (
        <div role="alertdialog" aria-label={`Incoming ${incoming.kind} call from ${incoming.title}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#0b2f2b] px-6 py-16 text-white">
          <div className="flex flex-col items-center gap-3 pt-10">
            <p className="flex items-center gap-1.5 text-sm tracking-[.02em] text-white/80"><IconLock size={14} /> Encrypted {incoming.kind === "video" ? "video" : "voice"} call</p>
            <Avatar name={incoming.title} size={112} />
            <p className="display text-3xl">{incoming.title}</p>
            <p className="text-white/70">Ringing…</p>
          </div>
          <div className="flex w-full max-w-xs justify-between">
            <button onClick={decline} disabled={busy} className="flex flex-col items-center gap-2 text-sm">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c62828]"><IconClose size={28} /></span>Decline
            </button>
            <button onClick={answer} disabled={busy} className="flex flex-col items-center gap-2 text-sm">
              <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-live">{incoming.kind === "video" ? <IconVideo size={28} /> : <IconPhone size={28} />}</span>Answer
            </button>
          </div>
        </div>
      )}
    </UnreadContext.Provider>
    </MeContext.Provider>
  );
}
