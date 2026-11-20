import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { dealInterest } from "@/lib/deals";
import { DealsSoon } from "@/components/deals-soon";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Date deals and events" };

export default function DealsPage() {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/deals");
  return <DealsSoon city={(await dealInterest(me.id)) ?? me.home_area ?? ""} subscribed={!!(await dealInterest(me.id))} />;
}
