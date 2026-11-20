import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile } from "@/lib/dating";
import { QuestionFlow } from "@/components/question-flow";
import { Skeleton } from "@/components/ui";
import type { Pack } from "@/lib/compatibility";

export const metadata = { title: "Compatibility questions" };

export default function QuestionsPage({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  const pack: Pack = (await searchParams).pack === "deep" ? "deep" : "basics";
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=${encodeURIComponent(pack === "deep" ? "/dating/questions?pack=deep" : "/dating/questions")}`);
  const profile = await getProfile(me.id);
  if (!profile) redirect("/dating/profile");
  return <QuestionFlow key={pack} pack={pack} initial={profile.answers ?? {}} />;
}
