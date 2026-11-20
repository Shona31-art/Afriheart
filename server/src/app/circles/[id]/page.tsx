import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getCircle, getPerson } from "@/lib/domain";
import { startNextInCircle } from "../../actions";
import { Notice, Section, Skeleton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatRelative } from "@/lib/time";

const STATE = { shaping: "Draft", deciding: "Voting", locked: "Locked", done: "Happened", dropped: "Dropped" } as const;

export default function CirclePage({ params, searchParams }: PageProps<"/circles/[id]">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <CircleContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CircleContent({ params, searchParams }: PageProps<"/circles/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const person = await getPerson(await getSessionPersonId());
  if (!person) redirect(`/signin?next=/circles/${id}`);
  const data = await getCircle(id, person.id);
  if (!data) notFound();
  const { circle, people, plans } = data;
  const now = new Date();
  const open = plans.some((p) => ["shaping", "deciding", "locked"].includes(p.state));
  return (
    <>
      <header className="mb-5">
        <p className="label mb-1">Circle</p>
        <h1 className="display text-3xl">{circle.name}</h1>
        <p className="mt-1 text-sm text-muted">{people.map((p) => p.name.split(" ")[0]).join(", ")}</p>
      </header>
      <Notice error={typeof sp.error === "string" ? sp.error : undefined} />
      <form action={startNextInCircle} className="mb-6">
        <input type="hidden" name="circle_id" value={circle.id} />
        <SubmitButton pending="Shaping the next one…">{open ? "Start another plan" : "Start the next one"}</SubmitButton>
        <p className="mt-2 text-xs text-muted">I&apos;ll reuse what worked last time and propose fresh options. Everyone in the Circle will see it.</p>
      </form>
      <Section title="History">
        {plans.map((p) => (
          <Link key={p.id} href={`/p/${p.slug}`} className="card flex items-center justify-between">
            <span className="font-semibold">{p.title}</span>
            <span className="text-xs text-muted">{STATE[p.state]} · {formatRelative(p.updated_at, now)}</span>
          </Link>
        ))}
      </Section>
    </>
  );
}
