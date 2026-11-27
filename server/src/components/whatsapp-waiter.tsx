"use client";

import { useEffect, useRef, useState } from "react";
import { finishWhatsAppSignInAction } from "@/app/actions";

type Status = "pending" | "confirmed" | "mismatch" | "hidden" | "expired" | "used";

/** Watches for the person's WhatsApp message, then signs this browser in by itself. */
export function WhatsAppWaiter({ id, name, next, respond, phoneLabel, startAgain }:
  { id: string; name: string; next: string; respond: string; phoneLabel: string; startAgain: string }) {
  const [status, setStatus] = useState<Status>("pending");
  const [hint, setHint] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const res = await fetch(`/api/whatsapp/signin/${id}`, { cache: "no-store" });
        const data = (await res.json()) as { status: Status; hint: string | null };
        if (stopped) return;
        setStatus(data.status);
        setHint(data.hint);
        if (data.status === "confirmed") {
          form.current?.requestSubmit();
          return;
        }
        if (data.status !== "pending") return;
      } catch {
        // Offline for a moment: keep trying.
      }
      // Check often at first, then less often.
      timer = setTimeout(check, document.visibilityState === "visible" ? 2000 : 4000);
    };
    timer = setTimeout(check, 1500);
    const again = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void check(); } };
    document.addEventListener("visibilitychange", again);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", again); };
  }, [id]);

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <form ref={form} action={finishWhatsAppSignInAction} hidden>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="respond" value={respond} />
      </form>
      {status === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="inline-block size-2 animate-pulse rounded-full bg-accent" aria-hidden />
          Waiting for your message. This page signs you in by itself once it arrives.
        </p>
      )}
      {(status === "confirmed" || status === "used") && <p className="text-sm font-semibold text-accent">Got it. Signing you in…</p>}
      {status === "mismatch" && (
        <p className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">
          That message came from a different WhatsApp number{hint ? ` (ending ${hint})` : ""}. Send it from the WhatsApp on {phoneLabel}, or <a className="font-semibold underline" href={startAgain}>start again with that number</a>.
        </p>
      )}
      {status === "hidden" && (
        <p className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">
          Your WhatsApp hides your number (you use a WhatsApp username), so we can&apos;t check it this way. <a className="font-semibold underline" href={startAgain}>Go back</a> and get a code by SMS instead.
        </p>
      )}
      {status === "expired" && (
        <p className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink">
          This took too long and has expired. <a className="font-semibold underline" href={startAgain}>Start again</a>.
        </p>
      )}
    </div>
  );
}
