import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError, getPerson } from "@/lib/domain";
import { thread } from "@/lib/chat";
import { cardGame } from "@/lib/cards";
import { CardsPage } from "@/components/cards-page";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Talking cards" };

export default function TalkingCards({ params }: PageProps<"/chats/[id]/cards">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Table params={params} />
    </Suspense>
  );
}

async function Table({ params }: { params: PageProps<"/chats/[id]/cards">["params"] }) {
  const { id } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/chats/${id}/cards`);
  const data = await Promise.all([thread(id, me.id), cardGame(id, me.id)]).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const [t, game] = data;
  return <CardsPage chatId={id} meId={me.id} title={t.chat.title} initial={game} />;
}
