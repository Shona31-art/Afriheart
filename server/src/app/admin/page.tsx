import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { permissions, ROLE_LABELS, staffRole } from "@/lib/admin";
import { AdminApp } from "@/components/admin";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const sp = await searchParams;
  const me = await getSessionPersonId();
  if (!me) redirect("/signin?next=/admin");
  const role = await staffRole(me);
  // Not on the team: the page doesn't exist for them.
  if (!role) notFound();
  return <main><AdminApp me={me} role={ROLE_LABELS[role]} perms={await permissions(me)} initialTab={typeof sp.tab === "string" ? sp.tab : undefined} /></main>;
}
