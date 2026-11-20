"use client";

import { addDataUsed, dataLightOn, LIGHT_VIDEO, LIGHT_VIDEO_BITRATE } from "@/lib/data-light";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CallView } from "@/lib/calls";
import { android, apiGet, apiSend, mmss } from "@/lib/client";
import { Avatar } from "./avatar";
import { useRingback } from "./sounds";
import { IconCamera, IconCameraOff, IconCards, IconClose, IconFlip, IconHangUp, IconLock, IconMic, IconMicOff, IconSpeaker } from "./icons";
import { CardGame } from "./card-game";
import type { CardGameView } from "@/lib/cards";
import { signCallDescription, verifyCallDescription } from "@/lib/e2e-device";
import { useLive } from "@/lib/live";

type SignedDesc = { desc: RTCSessionDescriptionInit; sd: string; sig: string };
const callText = (callId: string, from: string, to: string, type: string, sdp: string | undefined) => `${callId}|${from}|${to}|${type}|${sdp ?? ""}`;

type Signal = { id: string; from: string; type: "offer" | "answer" | "ice" | "bye"; payload: unknown; at: string };
interface Peer { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; initiator: boolean }

/**
 * A voice or video call. Phones connect directly to each other (WebRTC, a mesh
 * for group calls). The server only passes offers, answers and network
 * candidates between them. The person with the smaller id makes the offer, so
 * two phones never both offer at once.
 */
export function CallRoom({ callId, meId, cards = false }: { callId: string; meId: string; cards?: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<CallView | null>(null);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [states, setStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [now, setNow] = useState(() => Date.now());
  const [cardsOpen, setCardsOpen] = useState(cards);
  const local = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const peers = useRef(new Map<string, Peer>());
  const cursor = useRef<string | null>(null);
  const ended = useRef(false);
  const viewRef = useRef<CallView | null>(null);

  const send = useCallback((to: string, type: Signal["type"], payload: unknown) =>
    apiSend(`/api/calls/${callId}/signals`, "POST", { to, type, payload }).catch(() => undefined), [callId]);

  /** Offers and answers carry each phone's encryption fingerprint, so they're signed by this device. */
  const sendDesc = useCallback(async (to: string, type: "offer" | "answer", desc: RTCSessionDescriptionInit) => {
    const { sd, sig } = await signCallDescription(meId, callText(callId, meId, to, type, desc.sdp));
    await send(to, type, { desc, sd, sig } satisfies SignedDesc);
  }, [callId, meId, send]);

  const closePeer = useCallback((id: string) => {
    const p = peers.current.get(id);
    if (!p) return;
    // Count what the call used, for the data meter on the You tab.
    p.pc.getStats().then((stats) => stats.forEach((r) => { if (r.type === "transport") addDataUsed((r.bytesSent ?? 0) + (r.bytesReceived ?? 0)); })).catch(() => undefined);
    p.pc.close();
    peers.current.delete(id);
    setRemote((r) => { const n = { ...r }; delete n[id]; return n; });
    setStates((s) => { const n = { ...s }; delete n[id]; return n; });
  }, []);

  const createPeer = useCallback((id: string, initiator: boolean): Peer => {
    const pc = new RTCPeerConnection({ iceServers: viewRef.current?.ice_servers ?? [] });
    const peer: Peer = { pc, pending: [], initiator };
    peers.current.set(id, peer);
    local.current?.getTracks().forEach((t) => {
      const sender = pc.addTrack(t, local.current!);
      // Data-light mode: cap the video we send (the other person still hears every word).
      if (t.kind === "video" && dataLightOn()) {
        const params = sender.getParameters();
        params.encodings = [{ ...(params.encodings?.[0] ?? {}), maxBitrate: LIGHT_VIDEO_BITRATE }];
        sender.setParameters(params).catch(() => undefined);
      }
    });
    pc.onicecandidate = (e) => { if (e.candidate) send(id, "ice", e.candidate.toJSON()); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setRemote((r) => ({ ...r, [id]: stream }));
    };
    pc.onconnectionstatechange = () => {
      setStates((s) => ({ ...s, [id]: pc.connectionState }));
      if (pc.connectionState === "failed" && initiator) {
        pc.createOffer({ iceRestart: true }).then(async (o) => { await pc.setLocalDescription(o); await sendDesc(id, "offer", o); }).catch(() => undefined);
      }
    };
    return peer;
  }, [send, sendDesc]);

  const connect = useCallback(async (id: string) => {
    const peer = createPeer(id, true);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await sendDesc(id, "offer", offer);
  }, [createPeer, sendDesc]);

  const handle = useCallback(async (s: Signal) => {
    if (s.type === "bye") return closePeer(s.from);
    let peer = peers.current.get(s.from);
    if (s.type === "offer" || s.type === "answer") {
      // Only accept set-up signed by one of the caller's own devices: the server can't swap in its own keys.
      const signed = s.payload as SignedDesc;
      const ok = !!signed?.desc && (await verifyCallDescription(s.from, callText(callId, s.from, meId, s.type, signed.desc.sdp), signed.sd, signed.sig));
      if (!ok) {
        setError("This call couldn't be verified as end-to-end encrypted, so it wasn't connected.");
        closePeer(s.from);
        return;
      }
      s = { ...s, payload: signed.desc };
    }
    if (s.type === "offer") {
      if (!peer) peer = createPeer(s.from, false);
      await peer.pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await sendDesc(s.from, "answer", answer);
    } else if (s.type === "answer" && peer && peer.pc.signalingState === "have-local-offer") {
      await peer.pc.setRemoteDescription(s.payload as RTCSessionDescriptionInit);
      for (const c of peer.pending.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
    } else if (s.type === "ice" && peer) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(s.payload as RTCIceCandidateInit).catch(() => undefined);
      else peer.pending.push(s.payload as RTCIceCandidateInit);
    }
  }, [callId, meId, closePeer, createPeer, sendDesc]);

  const cleanup = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    android()?.inCall("none");
  }, [closePeer]);

  const finish = useCallback((chatId?: string) => {
    if (ended.current) return;
    ended.current = true;
    cleanup();
    setTimeout(() => router.replace(chatId ? `/chats/${chatId}` : "/"), 1200);
  }, [cleanup, router]);

  // Start: who's in the call, then the microphone (and camera).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await apiGet<CallView>(`/api/calls/${callId}`);
        viewRef.current = v;
        setView(v);
        if (v.state === "ended") return finish(v.chat_id);
        if (!v.participants.some((p) => p.id === meId)) await apiSend(`/api/calls/${callId}`, "POST", { action: "join" });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: v.kind === "video" ? { facingMode: "user", ...(dataLightOn() ? LIGHT_VIDEO : { width: { ideal: 640 }, height: { ideal: 480 } }) } : false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        local.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        android()?.inCall(v.kind);
        setSpeaker(v.kind === "video");
      } catch (e) {
        setError(e instanceof DOMException ? "Allow the microphone (and camera for video) to take calls." : (e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [callId, meId, finish]);

  // Check in every 2 s: keeps me in the call and connects to whoever is in it.
  useEffect(() => {
    const t = setInterval(async () => {
      if (ended.current) return;
      try {
        const v = await apiGet<CallView>(`/api/calls/${callId}`);
        viewRef.current = v;
        setView(v);
        if (v.state === "ended") return finish(v.chat_id);
        if (!local.current) return;
        const ids = new Set(v.participants.map((p) => p.id));
        for (const p of v.participants) {
          if (p.id !== meId && !peers.current.has(p.id) && meId < p.id) connect(p.id).catch(() => undefined);
        }
        for (const id of [...peers.current.keys()]) if (!ids.has(id)) closePeer(id);
      } catch {
        // network blip: keep going
      }
    }, 2000);
    return () => clearInterval(t);
  }, [callId, meId, connect, closePeer, finish]);

  // Signals: fetched the moment a realtime nudge for this call arrives. Backup polling is
  // quick while connecting, relaxed once connected, and slower again while the live connection is up.
  const kickSignals = useRef<() => void>(() => {});
  // Talking cards: when the other person deals or turns a card during the call, open the cards here too
  // (unless this person closed them).
  const chatRef = useRef<string | null>(null);
  const cardSig = useRef<string | null>(null);
  const cardsClosed = useRef(false);
  const checkCards = useRef(async (chatId: string) => {
    const g = await apiGet<CardGameView>(`/api/chats/${chatId}/cards`).catch(() => null);
    if (!g) return;
    const sig = `${g.deck}|${g.position}|${g.flipped}`;
    const changed = cardSig.current !== null && sig !== cardSig.current;
    cardSig.current = sig;
    if (changed && g.deck && g.updated_by !== meId && !cardsClosed.current) setCardsOpen(true);
  });
  useEffect(() => {
    if (!view?.chat_id || chatRef.current) return;
    chatRef.current = view.chat_id;
    void checkCards.current(view.chat_id);
  }, [view?.chat_id]);

  const isLive = useLive((n) => {
    if (n.call === callId || n.resync) kickSignals.current();
    if (chatRef.current && n.chat === chatRef.current) checkCards.current(chatRef.current);
  });
  const liveRef = useRef(isLive);
  useEffect(() => { liveRef.current = isLive; }, [isLive]);
  useEffect(() => {
    let stop = false;
    let busy = false;
    let again = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      clearTimeout(t);
      if (busy) { again = true; return; } // one fetch at a time, so no signal is handled twice
      busy = true;
      if (local.current) {
        try {
          const list = await apiGet<Signal[]>(`/api/calls/${callId}/signals${cursor.current ? `?after=${encodeURIComponent(cursor.current)}` : ""}`);
          for (const s of list) {
            cursor.current = s.at;
            await handle(s).catch(() => undefined);
          }
        } catch {
          // try again
        }
      }
      busy = false;
      if (stop) return;
      if (again) { again = false; tick(); return; }
      const connected = [...peers.current.values()].length > 0 && [...peers.current.values()].every((p) => p.pc.connectionState === "connected");
      t = setTimeout(tick, connected ? (liveRef.current ? 5000 : 1500) : (liveRef.current ? 1500 : 500));
    };
    kickSignals.current = tick;
    tick();
    return () => { stop = true; kickSignals.current = () => {}; clearTimeout(t); };
  }, [callId, handle]);

  // Leaving the page or closing the app hangs up.
  useEffect(() => {
    const bye = () => { if (!ended.current) navigator.sendBeacon(`/api/calls/${callId}`, JSON.stringify({ action: "leave" })); };
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); bye(); cleanup(); };
  }, [callId, cleanup]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ringing = view?.state === "ringing" && view.started_by === meId;
  useRingback(!!ringing && !error);

  async function hangUp() {
    for (const id of peers.current.keys()) send(id, "bye", null);
    await apiSend(`/api/calls/${callId}`, "POST", { action: "leave" }).catch(() => undefined);
    finish(view?.chat_id);
  }

  function toggleMute() {
    local.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  }
  function toggleCamera() {
    local.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    setCameraOff(!cameraOff);
  }
  async function flipCamera() {
    const next = facing === "user" ? "environment" : "user";
    try {
      const track = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } })).getVideoTracks()[0];
      for (const p of peers.current.values()) {
        const sender = p.pc.getSenders().find((s) => s.track?.kind === "video");
        await sender?.replaceTrack(track);
      }
      const old = local.current?.getVideoTracks()[0];
      if (old && local.current) { local.current.removeTrack(old); old.stop(); local.current.addTrack(track); }
      if (localVideo.current) localVideo.current.srcObject = local.current;
      setFacing(next);
    } catch {
      setError("Couldn't switch camera.");
    }
  }
  function toggleSpeaker() {
    android()?.setSpeaker(!speaker);
    setSpeaker(!speaker);
  }

  const others = view?.participants.filter((p) => p.id !== meId) ?? [];
  const connectedCount = Object.values(states).filter((s) => s === "connected").length;
  const status = !view ? "Connecting…"
    : view.state === "ended" ? "Call ended"
    : view.state === "ringing" ? (view.started_by === meId ? "Ringing…" : "Connecting…")
    : connectedCount === 0 ? "Connecting…"
    : view.connected_at ? mmss(now - Date.parse(view.connected_at)) : "";
  const isVideo = view?.kind === "video";
  const streams = Object.entries(remote);

  return (
    <main aria-label="Call" className="fixed inset-0 z-30 flex flex-col bg-[#0b2f2b] text-white" data-call-state={view?.state ?? "loading"} data-connected={connectedCount}>
      {isVideo && streams.length > 0 ? (
        <div className={`grid flex-1 gap-1 ${streams.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {streams.map(([id, s]) => <RemoteVideo key={id} stream={s} name={view?.participants.find((p) => p.id === id)?.name ?? ""} />)}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="flex items-center gap-1.5 text-sm tracking-[.02em] text-white/80"><IconLock size={14} /> Encrypted {isVideo ? "video" : "voice"} call</p>
          <Avatar name={view?.title ?? "…"} seed={view?.chat_id} size={120} />
          <p className="display text-3xl">{view?.title ?? ""}</p>
          {others.length > 1 && <p className="text-sm text-white/70">{others.map((o) => o.name.split(" ")[0]).join(", ")}</p>}
          <p className="text-lg text-white/80" aria-live="polite">{status}</p>
          {streams.map(([id, s]) => <RemoteAudio key={id} stream={s} />)}
        </div>
      )}
      {isVideo && streams.length > 0 && (
        <p className="absolute left-0 right-0 top-[max(1rem,env(safe-area-inset-top))] text-center text-sm font-semibold drop-shadow" aria-live="polite">
          {view?.title} · {status}
        </p>
      )}
      {isVideo && (
        <video ref={localVideo} autoPlay playsInline muted
          className={`absolute right-3 top-[max(3rem,env(safe-area-inset-top))] h-40 w-28 rounded-xl bg-black object-cover shadow-lg ${facing === "user" ? "-scale-x-100" : ""} ${cameraOff ? "opacity-20" : ""}`} />
      )}
      {error && <p role="alert" className="mx-4 mb-3 rounded-xl bg-[#d93b3b]/90 px-4 py-2 text-sm">{error}</p>}

      {view && view.state !== "ended" && !cardsOpen && (
        <button onClick={() => { cardsClosed.current = false; setCardsOpen(true); }}
          className="absolute left-3 top-[max(3rem,env(safe-area-inset-top))] flex min-h-11 items-center gap-1.5 rounded-full bg-black/45 px-4 text-sm font-semibold backdrop-blur">
          <IconCards size={18} /> Talking cards
        </button>
      )}
      {view && cardsOpen && (
        <section aria-label="Talking cards" className="relative mx-3 mb-3 max-h-[62dvh] overflow-y-auto rounded-3xl bg-[#082622]/90 p-3 pt-2 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Talking cards</h2>
            <button onClick={() => { cardsClosed.current = true; setCardsOpen(false); }} aria-label="Close talking cards" className="flex h-11 w-11 items-center justify-center rounded-full"><IconClose size={20} /></button>
          </div>
          <CardGame chatId={view.chat_id} meId={meId} compact onDark />
        </section>
      )}

      <div className="flex items-center justify-center gap-4 bg-black/30 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <Ctl label={muted ? "Unmute" : "Mute"} on={muted} onClick={toggleMute}>{muted ? <IconMicOff /> : <IconMic />}</Ctl>
        {isVideo && <Ctl label={cameraOff ? "Turn camera on" : "Turn camera off"} on={cameraOff} onClick={toggleCamera}>{cameraOff ? <IconCameraOff /> : <IconCamera />}</Ctl>}
        {isVideo && <Ctl label="Switch camera" onClick={flipCamera}><IconFlip /></Ctl>}
        <Ctl label={speaker ? "Speaker off" : "Speaker on"} on={speaker} onClick={toggleSpeaker}><IconSpeaker /></Ctl>
        <button onClick={hangUp} aria-label="End call" className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c62828]"><IconHangUp size={28} /></button>
      </div>
    </main>
  );
}

function Ctl({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={on}
      className={`flex h-14 w-14 items-center justify-center rounded-full ${on ? "bg-white text-black" : "bg-white/15"}`}>
      {children}
    </button>
  );
}

function RemoteVideo({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative bg-black">
      <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" data-remote-video />
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs">{name}</span>
    </div>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay data-remote-audio />;
}
