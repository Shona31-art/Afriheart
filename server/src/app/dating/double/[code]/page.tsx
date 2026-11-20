import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile } from "@/lib/dating";
import { inviteInfo } from "@/lib/double";
import { JoinDuo } from "@/components/double";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Double date invite", robots: { index: false } };

export default function DoubleInvitePage({ params }: PageProps<"/dating/double/[code]">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: PageProps<"/dating/double/[code]">["params"] }) {
  const { code } = await params;
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect(`/signin?next=${encodeURIComponent(`/dating/double/${code}`)}`);
  if (!(await getProfile(me.id))) redirect(`/dating/profile`);
  return <JoinDuo code={code} invite={await inviteInfo(code)} />;
}
