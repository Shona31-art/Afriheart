"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiSend } from "@/lib/client";
import type { VerifyStatus } from "@/lib/team";
import { IconBack, IconCamera, IconRetry, IconShield } from "./icons";

/** Photo verification: consent, a pose from the server, a live selfie from the camera, then the team checks it. */
export function VerifyFlow({ initial }: { initial: VerifyStatus }) {
  const [status, setStatus] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
  };
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  // Connect the camera once the video element is on screen.
  useEffect(() => {
    if (cameraOn && video.current && stream.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => undefined);
    }
  }, [cameraOn]);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      const s = await apiSend<VerifyStatus>("/api/dating/verify", "POST");
      setStatus(s);
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false });
      stream.current = media;
      setCameraOn(true);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? "Afriheart needs the camera for the selfie. Allow it in your phone's settings, then try again." : err.message || "Couldn't open the camera.");
    } finally {
      setBusy(false);
    }
  }

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    const size = Math.min(v.videoWidth, v.videoHeight);
    canvas.width = 720;
    canvas.height = 720;
    canvas.getContext("2d")!.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 720, 720);
    canvas.toBlob((b) => {
      if (!b) return setError("Couldn't take the selfie. Try again.");
      setShot({ blob: b, url: URL.createObjectURL(b) });
      stop();
    }, "image/jpeg", 0.88);
  }

  async function send() {
    if (!shot) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", new File([shot.blob], "selfie.jpg", { type: "image/jpeg" }));
      form.set("consent", consent ? "yes" : "no");
      setStatus(await apiSend<VerifyStatus>("/api/dating/verify/selfie", "POST", form));
      setShot(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-4 flex items-center gap-1">
      <Link href="/you" className="icon-btn -ml-3" aria-label="Back"><IconBack /></Link>
      <h1 className="display text-3xl">Photo verification</h1>
    </div>
  );

  if (status.state === "approved") {
    return (
      <main className="page">
        {header}
        <section className="card flex flex-col items-center gap-3 py-8 text-center">
          <IconShield size={48} className="text-accent" />
          <h2 className="display text-2xl">You&apos;re verified</h2>
          <p className="max-w-xs text-sm text-muted">Your profile shows a verified badge. You can now choose to see only verified people.</p>
          <Link href="/dating/profile" className="btn btn-sm">Only show verified people</Link>
        </section>
      </main>
    );
  }

  if (status.state === "pending") {
    return (
      <main className="page">
        {header}
        <section className="card flex flex-col items-center gap-3 py-8 text-center" role="status">
          <IconShield size={48} className="text-muted" />
          <h2 className="display text-2xl">Your selfie is being checked</h2>
          <p className="max-w-xs text-sm text-muted">A person on the Afriheart team compares it with your photos, usually within a day. The selfie is deleted as soon as it&apos;s checked.</p>
          <Link href="/discover" className="btn btn-sm">Back to Discover</Link>
        </section>
      </main>
    );
  }

  const inProgress = cameraOn || shot;
  return (
    <main className="page">
      {header}
      {error && <p role="alert" className="mb-4 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">{error}</p>}
      {status.state === "rejected" && !inProgress && (
        <p className="mb-4 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink"><strong>Your last selfie wasn&apos;t approved.</strong> {status.reason} You can try again.</p>
      )}

      {!inProgress && (
        <section className="card flex flex-col gap-3">
          <p className="flex items-center gap-2 font-semibold"><IconShield size={20} className="text-accent" /> Show people you&apos;re really you</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>We&apos;ll ask you to do a pose, like a thumbs up.</li>
            <li>Take a selfie doing it, right now in the app.</li>
            <li>A person on the Afriheart team checks it matches your photos.</li>
          </ol>
          <p className="text-sm text-muted">Verified people get a badge and can choose to meet only other verified people.</p>
          <label className="mt-1 flex items-start gap-3 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
            <span>I agree that Afriheart uses this selfie only to check it&apos;s me. Only the Afriheart team sees it, and it&apos;s deleted once it&apos;s checked. Only the result is kept. <a href="/privacy" className="font-semibold text-accent underline">Privacy policy</a></span>
          </label>
          <button className="btn" disabled={!consent || busy} onClick={begin}><IconCamera size={18} /> {busy ? "Opening camera…" : "Start"}</button>
        </section>
      )}

      {inProgress && status.gesture && (
        <section aria-labelledby="pose" className="flex flex-col gap-3">
          <p className="text-sm text-muted">Your pose</p>
          <h2 id="pose" className="display -mt-2 text-2xl" data-gesture={status.gesture}>{status.gesture}</h2>
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
            {cameraOn && <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Camera preview" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {shot && <img src={shot.url} alt="Your selfie" className="h-full w-full object-cover" />}
            <span aria-hidden className="pointer-events-none absolute inset-[12%] rounded-full border-2 border-white/60" />
          </div>
          <p className="text-center text-sm text-muted">Face the camera in good light, with your whole face inside the circle. No sunglasses or filters.</p>
          {cameraOn ? (
            <button className="btn" onClick={capture}><IconCamera size={18} /> Take selfie</button>
          ) : (
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => { setShot(null); begin(); }}><IconRetry size={18} /> Retake</button>
              <button className="btn flex-1" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send for checking"}</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
