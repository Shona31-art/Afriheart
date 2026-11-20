import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { isTeam, reportQueue, verificationQueue } from "@/lib/team";
import { weMetStats } from "@/lib/we-met";
import { TeamQueue } from "@/components/team-queue";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Team", robots: { index: false } };

export default function TeamPage() {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const me = await getSessionPersonId();
  if (!me) redirect("/signin?next=/team");
  if (!(await isTeam(me))) notFound();
  const [selfies, reports, met] = await Promise.all([verificationQueue(me), reportQueue(me), weMetStats()]);
  return <TeamQueue initialSelfies={selfies} initialReports={reports} met={met} />;
}
