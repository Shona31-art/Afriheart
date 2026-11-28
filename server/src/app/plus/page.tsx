import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { PASSES, PLUS_PERKS, paymentProvider, plusUntil, trialState } from "@/lib/plus";
import { PlusCheckout } from "@/components/plus-checkout";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Afriheart+" };

export default function PlusPage({ searchParams }: PageProps<"/plus">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/plus">["searchParams"] }) {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/plus");
  const sp = await searchParams;
  const passes = Object.entries(PASSES).map(([id, p]) => ({ id, label: p.label, cents: p.cents, note: p.note ?? null, days: p.days }));
  return (
    <PlusCheckout
      until={await plusUntil(me.id)}
      passes={passes}
      perks={PLUS_PERKS}
      available={!!paymentProvider()}
      testMode={paymentProvider() === "test"}
      paidId={typeof sp.paid === "string" ? sp.paid : null}
      cancelled={sp.cancelled === "1"}
      trial={await trialState(me.id)}
      from={typeof sp.from === "string" ? sp.from : null}
    />
  );
}
