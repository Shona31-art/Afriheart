import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError } from "@/lib/domain";
import { thread } from "@/lib/support";
import { TicketThread } from "@/components/support";
import { IconBack } from "@/components/icons";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Support ticket" };
const STATUS: Record<string, string> = { open: "Waiting for the team", waiting: "The team replied", resolved: "Solved" };

export default function TicketPage({ params }: PageProps<"/support/[id]">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/support/[id]">["params"] }) {
  const { id } = await params;
  const me = await getSessionPersonId();
  if (!me) redirect(`/signin?next=/support/${id}`);
  const data = await thread(me, id, false).catch((e) => {
    if (e instanceof DomainError) return null;
    throw e;
  });
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Link href="/support" className="icon-btn -ml-3" aria-label="Back to help and support"><IconBack /></Link>
        <div className="min-w-0">
          <h1 className="display truncate text-2xl">{data.ticket.subject}</h1>
          <p className="text-sm text-muted">{data.ticket.category_label} · {STATUS[data.ticket.status]}</p>
        </div>
      </div>
      <TicketThread id={id} initial={data} />
    </div>
  );
}
