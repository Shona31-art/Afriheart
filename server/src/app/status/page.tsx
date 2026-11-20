import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { StatusViewer } from "@/components/status";

export const metadata = { title: "Status" };

export default function StatusPage({ searchParams }: PageProps<"/status">) {
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-black" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/status">["searchParams"] }) {
  const sp = await searchParams;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/status");
  const who = typeof sp.p === "string" ? sp.p : "me";
  return <StatusViewer key={who} personId={me.id} who={who} />;
}
