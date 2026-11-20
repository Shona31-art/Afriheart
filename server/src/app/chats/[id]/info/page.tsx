import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError, getPerson } from "@/lib/domain";
import { thread } from "@/lib/chat";
import { matchProfile } from "@/lib/dating";
import { ChatInfo } from "@/components/chat-info";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Chat info" };

export default function ChatInfoPage({ params }: PageProps<"/chats/[id]/info">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Info params={params} />
    </Suspense>
  );
}

async function Info({ params }: { params: PageProps<"/chats/[id]/info">["params"] }) {
  const { id } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=/chats/${id}/info`);
  const data = await thread(id, me.id).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  const profile = data.chat.is_match ? await matchProfile(id, me.id) : null;
  return <ChatInfo chatId={id} meId={me.id} chat={data.chat} members={data.members} profile={profile} />;
}
