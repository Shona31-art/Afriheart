import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError } from "@/lib/domain";
import { invitePreview } from "@/lib/chat-extras";
import { JoinGroup } from "@/components/join-group";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Join group" };

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  const me = await getSessionPersonId();
  if (!me) redirect(`/signin?next=/join/${encodeURIComponent(token)}`);
  const preview = await invitePreview(token, me).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (preview?.member) redirect(`/chats/${preview.chat_id}`);
  return <JoinGroup token={token} preview={preview} />;
}
