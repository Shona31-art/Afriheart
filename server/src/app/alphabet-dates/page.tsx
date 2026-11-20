import "@fontsource/dancing-script/600.css";
import "@fontsource/caveat/500.css";
import Link from "next/link";
import { IDEAS, STYLES } from "@/lib/alphabet-ideas";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const metadata = {
  title: "Alphabet date ideas: 26 dates from A to Z",
  description: "Alphabet dating: a date for every letter, from Aquarium to Zoo. Over 280 ideas in five styles: out and about, at home, free and cheap, foodie and adventure. Keep them as a photo album on Afriheart.",
  openGraph: { title: "Alphabet date ideas from A to Z", description: "A date for every letter, kept as a photo album you can share." },
};

/** Public page for people arriving from a shared album page: the idea, all the ideas, and a way in. */
export default function AlphabetDatesPage() {
  return (
    <main className="page album mx-auto w-full max-w-3xl">
      <section className="album-paper mb-6 flex flex-col items-center px-6 py-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[color:var(--album-soft)]">Alphabet dating</p>
        <h1 className="font-script mt-2 text-5xl leading-[1.05] text-[color:var(--album-ink)]">Alphabet date ideas</h1>
        <p className="font-hand mt-3 max-w-md text-2xl text-[color:var(--album-green)]">One date for every letter, from A to Z. One photo and one little story for each.</p>
        <p className="mt-4 max-w-md text-sm text-[color:var(--album-soft)]">
          On Afriheart you plan each letter in your chat, add a photo when you&apos;ve been, and keep it all as an album you can print or share.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/signin?next=/discover" className="btn">Start your album on Afriheart</Link>
          <Link href="/quiz" className="btn btn-ghost">Take the compatibility quiz</Link>
        </div>
      </section>

      <h2 className="display mb-1 text-2xl">All 26 letters</h2>
      <p className="mb-4 text-sm text-muted">Pick a style that suits you: {STYLES.map((s) => s.name.toLowerCase()).join(", ")}. Or mix them.</p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {LETTERS.map((l) => (
          <li key={l} className="album-paper px-4 py-3">
            <h3 className="flex items-baseline gap-2">
              <span className="display text-3xl text-[color:var(--album-green)]">{l}</span>
              <span className="font-script text-2xl text-[color:var(--album-ink)]">{IDEAS[l].out[0]}</span>
            </h3>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-sm">
              {STYLES.map((s) => (
                <div key={s.id} className="contents">
                  <dt className="text-[color:var(--album-soft)]">{s.name}</dt>
                  <dd className="text-[color:var(--album-ink)]">{IDEAS[l][s.id].join(", ")}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>

      <section className="card mt-8 flex flex-col items-center gap-3 py-8 text-center">
        <h2 className="display text-2xl">Ready for A?</h2>
        <p className="max-w-sm text-sm text-muted">Meet someone you click with, or bring your partner. Afriheart keeps your plans, photos and stories private, end-to-end encrypted.</p>
        <Link href="/signin?next=/discover" className="btn">Get started</Link>
        <p className="text-xs text-muted"><Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
      </section>
    </main>
  );
}
