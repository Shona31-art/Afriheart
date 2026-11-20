import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson, DomainError } from "@/lib/domain";
import { thread } from "@/lib/chat";
import { Thread } from "@/components/thread";
import { Skeleton } from "@/components/ui";

export default function ChatPage({ params }: PageProps<"/chats/[id]">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <ChatContent params={params} />
    </Suspense>
  );
}

async function ChatContent({ params }: { params: PageProps<"/chats/[id]">["params"] }) {
  const { id } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/chats/${id}`);
  const data = await thread(id, me.id).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  return <Thread chatId={id} me={{ id: me.id, name: me.name }} initial={data} />;
}
