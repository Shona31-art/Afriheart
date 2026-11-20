import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile } from "@/lib/dating";
import { verifyStatus } from "@/lib/team";
import { VerifyFlow } from "@/components/verify-flow";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Photo verification" };

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/dating/verify");
  if (!(await getProfile(me.id))) redirect("/dating/profile");
  return <VerifyFlow initial={await verifyStatus(me.id)} />;
}
