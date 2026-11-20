import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError, getPerson } from "@/lib/domain";
import { thread } from "@/lib/chat";
import { azBoard } from "@/lib/az";
import { AzBoard } from "@/components/az-board";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Alphabet date ideas" };

export default function AzPage({ params }: PageProps<"/chats/[id]/az">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Board params={params} />
    </Suspense>
  );
}

async function Board({ params }: { params: PageProps<"/chats/[id]/az">["params"] }) {
  const { id } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/chats/${id}/az`);
  const data = await Promise.all([thread(id, me.id), azBoard(id, me.id)]).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const [t, board] = data;
  return <AzBoard chatId={id} meId={me.id} myName={me.name} title={t.chat.title} initial={board} />;
}
