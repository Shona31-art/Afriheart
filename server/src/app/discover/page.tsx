import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile } from "@/lib/dating";
import { Discover } from "@/components/discover";
import { Skeleton } from "@/components/ui";
import { answeredCount } from "@/lib/compatibility";

export const metadata = { title: "Discover" };

export default function DiscoverPage({ searchParams }: PageProps<"/discover">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/discover">["searchParams"] }) {
  const mode = (await searchParams).mode === "double" ? "double" : "solo";
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/discover");
  const profile = await getProfile(me.id);
  if (!profile) redirect("/dating/profile");
  return <Discover key={mode} paused={profile.paused} answered={answeredCount(profile.answers)} initialMode={mode} />;
}
