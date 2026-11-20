import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { startPlan } from "../actions";
import { Header, Notice, Skeleton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Start a plan" };

const STARTERS = [
  "Dinner on Florida Road this Friday",
  "Sunrise walk on the promenade this weekend",
  "5-a-side football on Saturday morning",
  "Braai at mine sometime this month",
  "Birthday dinner for Thandi",
  "Trail run at Giba Gorge on Sunday",
];

export default function StartPage({ searchParams }: PageProps<"/start">) {
  return (
    <main className="page">
      <Header eyebrow="Start" title="What do you want to make happen?" />
      <Suspense fallback={<Skeleton />}>
        <StartForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function StartForm({ searchParams }: { searchParams: PageProps<"/start">["searchParams"] }) {
  const person = await getPerson(await getSessionPersonId());
  if (!person) redirect("/signin?next=/start");
  const sp = await searchParams;
  const spark = typeof sp.spark === "string" ? sp.spark : "";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <>
      <Notice error={error} />
      <form action={startPlan} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="spark">Your idea</label>
        <textarea id="spark" name="spark" className="field min-h-28 text-lg" required minLength={3} maxLength={500}
          defaultValue={spark} placeholder="Braai with the varsity crew sometime this month…" />
        <p className="text-sm text-muted">
          Paste a link or a WhatsApp message too. I&apos;ll suggest concrete options with times, places and rough costs. You review them before anyone sees them.
        </p>
        <SubmitButton pending="Shaping your plan…">Shape it</SubmitButton>
      </form>

      <p className="label mb-2 mt-8">Or tap a starter</p>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <form key={s} action={startPlan}>
            <input type="hidden" name="spark" value={s} />
            <button className="chip" type="submit">{s}</button>
          </form>
        ))}
      </div>
    </>
  );
}
