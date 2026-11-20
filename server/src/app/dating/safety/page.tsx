import Link from "next/link";
import { IconBack, IconShield } from "@/components/icons";

export const metadata = { title: "Dating safety" };

const TIPS: [string, string][] = [
  ["Keep chatting on Afriheart", "Your number stays private here, and you can unmatch or report at any time. Share your number only when you're ready."],
  ["Video call first", "A quick video call from the chat helps make sure they're who their photos say."],
  ["Meet in public", "For a first date, pick a busy place: a café, a market, a promenade. Get there and back on your own."],
  ["Tell a friend", "On your date's plan card, tap \"Share date details with a friend\" to send them who, where and when."],
  ["Never send money", "Nobody genuine asks for money, airtime, gift cards or crypto, however good the story. Report it straight away."],
  ["Trust your gut", "You can leave at any time. If something feels off, report it. The person won't know it was you."],
];

export default function SafetyPage() {
  return (
    <main className="page">
      <div className="mb-4 flex items-center gap-1">
        <Link href="/discover" className="icon-btn -ml-3" aria-label="Back to Discover"><IconBack /></Link>
        <h1 className="display flex items-center gap-2 text-3xl"><IconShield /> Dating safety</h1>
      </div>
      <ol className="flex flex-col gap-3">
        {TIPS.map(([t, d], i) => (
          <li key={t} className="card flex gap-3">
            <span className="display text-2xl text-accent">{i + 1}</span>
            <div>
              <h2 className="font-semibold">{t}</h2>
              <p className="text-sm text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="card mt-4 text-sm" aria-labelledby="h-help">
        <h2 id="h-help" className="mb-1 font-semibold">If you need help now</h2>
        <p>Police (SAPS): <a className="font-semibold text-accent underline" href="tel:10111">10111</a> · From a mobile: <a className="font-semibold text-accent underline" href="tel:112">112</a></p>
        <p className="mt-1">GBV Command Centre (24 hours): <a className="font-semibold text-accent underline" href="tel:0800428428">0800 428 428</a></p>
      </section>
      <section className="card mt-4 text-sm" aria-labelledby="h-privacy">
        <h2 id="h-privacy" className="mb-1 font-semibold">Your privacy</h2>
        <p className="text-muted">Only your first name, age, area, photos, bio and date idea are shown. Your phone number, exact location and who you&apos;re interested in are never shown to anyone. Messages and calls with matches are end-to-end encrypted. You can pause or delete your dating profile any time from your profile.</p>
      </section>
    </main>
  );
}
