import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { SupportCentre } from "@/components/support";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Help and support" };

export default function SupportPage({ searchParams }: PageProps<"/support">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/support">["searchParams"] }) {
  const sp = await searchParams;
  const me = await getSessionPersonId();
  return <SupportCentre signedIn={!!me} initialCategory={typeof sp.topic === "string" ? sp.topic : undefined} />;
}
