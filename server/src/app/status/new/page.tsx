import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { StatusComposer } from "@/components/status";

export const metadata = { title: "New status" };

export default function NewStatusPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 bg-brand" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/status/new");
  return <StatusComposer personId={me.id} />;
}
