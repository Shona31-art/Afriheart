import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError, getPerson } from "@/lib/domain";
import { coupleSpace } from "@/lib/couple";
import { CoupleSpace } from "@/components/couple-space";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Couple space" };

export default function CouplePage({ params }: PageProps<"/chats/[id]/us">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/chats/[id]/us">["params"] }) {
  const { id } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/chats/${id}/us`);
  const view = await coupleSpace(id, me.id).catch((e) => (e instanceof DomainError ? null : Promise.reject(e)));
  if (!view) notFound();
  return <CoupleSpace chatId={id} meId={me.id} initial={view} />;
}
