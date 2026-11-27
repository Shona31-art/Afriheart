import Link from "next/link";
import { Suspense } from "react";
import { requestSignInCode, verifySignInCode } from "../actions";
import { Notice, Skeleton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/client";
import { otpProvider } from "@/lib/otp";
import { whatsappLink, whatsappSignInOn } from "@/lib/whatsapp-signin";
import { WhatsAppWaiter } from "@/components/whatsapp-waiter";

export const metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <main className="flex min-h-dvh flex-col">
      {/* The first thing anyone sees: malachite, a fine gold frame, and the promise in Bodoni. */}
      <section className="relative overflow-hidden bg-[radial-gradient(130%_90%_at_20%_0%,#1a5a4f_0%,#0e3b34_45%,#07201c_100%)] px-7 pb-24 pt-[max(3.25rem,env(safe-area-inset-top))] text-[#f4f1e8]">
        <span aria-hidden className="pointer-events-none absolute inset-x-3 bottom-12 top-3 rounded-[26px] border border-[#d6b77e]/45" />
        <h1 className="display flex items-center gap-2.5 text-[1.9rem]">{/* eslint-disable-next-line @next/next/no-img-element -- a tiny SVG logo */}
<img src="/afriheart-mark-on-dark.svg" alt="" width={36} height={36} className="shrink-0" />Afriheart</h1>
        <p className="display mt-10 max-w-[13ch] text-[2.9rem] leading-[1.02]">Meet someone over a real date.</p>
        <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-[#f4f1e8]/80">Every profile comes with a date they&apos;d love to go on. Match, talk privately, and make it happen.</p>
      </section>
      <div className="relative z-[1] -mt-8 flex flex-1 flex-col px-4 pb-10">
        <Suspense fallback={<Skeleton />}>
          <SignInForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignInForm({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const next = get("next") || "/discover";
  const error = get("error") || undefined;

  const waOn = whatsappSignInOn();
  const smsOn = otpProvider() !== null;
  const startAgain = `/signin?${new URLSearchParams({ next, name: get("name"), ...(get("respond") ? { respond: get("respond") } : {}) })}`;

  if (get("step") === "whatsapp" && waOn && /^\d{6}$/.test(get("code"))) {
    const phone = get("phone");
    const code = get("code");
    return (
      <div className="flex flex-col gap-3">
        <div className="card flex flex-col gap-3">
          <Notice error={error} />
          <p className="text-sm">Send this WhatsApp message from <strong>{formatPhone(phone)}</strong>:</p>
          <p className="rounded-xl border border-line bg-paper px-4 py-3 text-center">
            <span className="block text-xs text-muted">Afriheart code</span>
            <span className="display text-3xl tracking-[0.3em]" data-wa-code={code}>{code}</span>
          </p>
          <a className="btn" href={whatsappLink(code)} target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
          <p className="text-xs text-muted">WhatsApp opens with the message already typed. Tap send, then come back here. It&apos;s free: we never message you back.</p>
          <WhatsAppWaiter id={get("id")} name={get("name")} next={next} respond={get("respond")} phoneLabel={formatPhone(phone)} startAgain={startAgain} />
        </div>
        <div className="text-center text-sm">
          {smsOn && (
            <form action={requestSignInCode} className="inline">
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="name" value={get("name")} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="respond" value={get("respond")} />
              <button className="text-accent underline" name="method" value="sms">No WhatsApp? Get an SMS code</button>
              <span className="text-muted"> · </span>
            </form>
          )}
          <a className="text-muted underline" href={startAgain}>Use a different number</a>
        </div>
      </div>
    );
  }

  if (get("step") === "code") {
    const phone = get("phone");
    return (
      <div className="flex flex-col gap-3">
        <form action={verifySignInCode} className="card flex flex-col gap-3">
          <Notice error={error} />
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="name" value={get("name")} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="respond" value={get("respond")} />
          <p className="text-sm">We sent a 6-digit code to <strong>{formatPhone(phone)}</strong>.</p>
          {get("test") && (
            <p className="rounded-lg bg-warm-soft px-3 py-2 text-sm text-warm-ink" data-test-code={get("test")}>
              Test mode (no SMS sender set up): your code is <strong>{get("test")}</strong>
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="label">Code</span>
            <input className="field text-center text-2xl tracking-[0.5em]" name="code" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="••••••" aria-label="Code" />
          </label>
          <SubmitButton pending="Checking…">Verify</SubmitButton>
        </form>
        <form action={requestSignInCode} className="text-center text-sm">
          <input type="hidden" name="phone" value={phone} />
          <input type="hidden" name="name" value={get("name")} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="respond" value={get("respond")} />
          <button className="text-accent underline">Send a new code</button>
          <span className="text-muted"> · </span>
          <a className="text-muted underline" href={`/signin?next=${encodeURIComponent(next)}`}>Use a different number</a>
        </form>
      </div>
    );
  }

  return (
    <form action={requestSignInCode} className="card flex flex-col gap-3">
      <Notice error={error} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="respond" value={get("respond")} />
      <label className="flex flex-col gap-1">
        <span className="label">Your name</span>
        <input className="field" name="name" autoComplete="given-name" required maxLength={60} placeholder="Lwazi" defaultValue={get("name")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Mobile number</span>
        <input className="field" name="phone" type="tel" autoComplete="tel" required placeholder="082 123 4567" />
      </label>
      {waOn ? (
        <>
          <SubmitButton name="method" value="whatsapp" pending="Getting your code…">Verify with WhatsApp</SubmitButton>
          {smsOn && <SubmitButton className="btn btn-ghost" name="method" value="sms" pending="Sending code…">Send me an SMS code instead</SubmitButton>}
        </>
      ) : (
        <SubmitButton pending="Sending code…">Send me a code</SubmitButton>
      )}
      <Link href="/support?topic=sign_in" className="text-sm font-semibold text-accent underline">Trouble signing in? Get help</Link>
      <p className="text-xs text-muted">By continuing you agree to the <a href="/terms" className="font-semibold text-accent underline">Terms</a> and <a href="/privacy" className="font-semibold text-accent underline">Privacy policy</a>. Afriheart is for people 18 and older.</p>
            <p className="text-xs text-muted">
        We check it&apos;s your number with a quick WhatsApp message or SMS code. Your number is how friends find you; it&apos;s never shown publicly. You must be 18 or older to use Afriheart.
      </p>
    </form>
  );
}
