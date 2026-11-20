import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson, listCircles } from "@/lib/domain";
import { CATEGORY_LABELS } from "@/lib/types";
import { Header, Skeleton } from "@/components/ui";

export const metadata = { title: "Circles" };

export default function CirclesPage() {
  return (
    <main className="page">
      <Header eyebrow="Circles" title="Your recurring groups">
        The running crew, the Friday dinner lot, the 5-a-side team. A Circle starts when a plan works and people want to do it again.
      </Header>
      <Suspense fallback={<Skeleton />}>
        <CirclesList />
      </Suspense>
    </main>
  );
}

async function CirclesList() {
  const person = await getPerson(await getSessionPersonId());
  if (!person) redirect("/signin?next=/circles");
  const circles = await listCircles(person.id);
  if (!circles.length) {
    return (
      <div className="card">
        <p className="font-semibold">No Circles yet</p>
        <p className="text-sm text-muted">After a plan happens, the organiser can turn the group into a Circle in one tap.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {circles.map(({ circle, memberCount, plans }) => (
        <li key={circle.id}>
          <Link href={`/circles/${circle.id}`} className="card block">
            <p className="font-semibold">{circle.name}</p>
            <p className="text-sm text-muted">
              {CATEGORY_LABELS[circle.category]} · {memberCount} people · {plans.filter((p) => p.state === "done").length} happened
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
