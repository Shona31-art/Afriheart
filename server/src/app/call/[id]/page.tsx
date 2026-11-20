import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { CallRoom } from "@/components/call-room";

export const metadata = { title: "Call" };

export default function CallPage({ params, searchParams }: PageProps<"/call/[id]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#0b2f2b]" />}>
      <Room params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Room({ params, searchParams }: { params: PageProps<"/call/[id]">["params"]; searchParams: PageProps<"/call/[id]">["searchParams"] }) {
  const { id } = await params;
  const cards = (await searchParams).cards === "1";
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/call/${id}`);
  return <CallRoom callId={id} meId={me.id} cards={cards} />;
}
