import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson, nowFeed, type NowCard } from "@/lib/domain";
import { formatRelative, formatWhen } from "@/lib/time";
import { Section, Skeleton } from "@/components/ui";

export const metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <NowContent />
      </Suspense>
    </main>
  );
}

async function NowContent() {
  const person = await getPerson(await getSessionPersonId());
  if (!person) redirect("/signin?next=/plans");
  const now = new Date();
  const feed = await nowFeed(person.id);
  const empty = !feed.needsYou.length && !feed.inMotion.length && !feed.recent.length;
  return (
    <>
      <header className="mb-6">
        <div className="mb-1 flex items-center justify-between">
          <p className="label">Plans</p>
          <div className="flex gap-2">
            <Link href="/circles" className="btn btn-ghost btn-sm">Circles</Link>
            <Link href="/start" className="btn btn-sm">+ New plan</Link>
          </div>
        </div>
        <h1 className="display text-3xl">
          {feed.needsYou.length ? `${feed.needsYou.length} thing${feed.needsYou.length === 1 ? "" : "s"} need${feed.needsYou.length === 1 ? "s" : ""} you` : `Hi ${person.name.split(" ")[0]}`}
        </h1>
      </header>

      <Link href="/deals" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-accent-soft/60 px-4 py-2.5 text-sm">
        <span><strong>Date deals and events</strong>: specials, singles nights and group braais.</span>
        <span className="shrink-0 font-semibold text-accent">Coming soon</span>
      </Link>

      {empty && (
        <div className="card mb-6">
          <p className="display mb-1 text-xl">What do you want to make happen?</p>
          <p className="mb-4 text-muted">Start one here, or in any chat: tap ✨ or type “@afri braai on Saturday”. I&apos;ll turn it into options your friends vote on, right in the chat.</p>
          <Link href="/start" className="btn">Start your first plan</Link>
        </div>
      )}

      {feed.needsYou.length > 0 && (
        <Section title="Needs you">
          {feed.needsYou.map((c) => <Card key={`${c.kind}-${c.slug}`} card={c} now={now} strong />)}
        </Section>
      )}
      {feed.inMotion.length > 0 && (
        <Section title="In motion">
          {feed.inMotion.map((c) => <Card key={`${c.kind}-${c.slug}`} card={c} now={now} />)}
        </Section>
      )}
      {feed.sparks.length > 0 && (
        <Section title="From your companion">
          {feed.sparks.map((c) => <Card key={c.href} card={c} now={now} />)}
        </Section>
      )}
      {feed.recent.length > 0 && (
        <Section title="Recently happened">
          {feed.recent.map((c) => <Card key={`${c.kind}-${c.slug}`} card={c} now={now} />)}
        </Section>
      )}
    </>
  );
}

function Card({ card, now, strong }: { card: NowCard; now: Date; strong?: boolean }) {
  const when = card.at
    ? card.kind === "decide" || (card.kind === "organise" && card.cta === "Nudge maybes")
      ? `Vote closes ${formatRelative(card.at, now)}`
      : card.kind === "recent" ? formatRelative(card.at, now) : formatWhen(card.at)
    : null;
  return (
    <Link href={card.href} className={`card flex items-center justify-between gap-3 ${strong ? "border-accent/40" : ""}`}>
      <div className="min-w-0">
        <p className="truncate font-semibold">{card.title}</p>
        <p className="text-sm text-muted">{card.detail}</p>
        {when && <p className="mt-1 text-xs font-semibold text-accent">{when}</p>}
      </div>
      <span className={strong ? "btn btn-sm" : "btn btn-ghost btn-sm"}>{card.cta}</span>
    </Link>
  );
}
