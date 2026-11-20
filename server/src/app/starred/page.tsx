import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { starredMessages } from "@/lib/chat-extras";
import { Starred } from "@/components/starred";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Starred messages" };

export default function StarredPage() {
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
  if (!me) redirect("/signin?next=/starred");
  return <Starred me={me.id} initial={await starredMessages(me.id)} />;
}
