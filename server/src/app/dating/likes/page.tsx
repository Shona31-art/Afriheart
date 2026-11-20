import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile, likesYou } from "@/lib/dating";
import { LikesYou } from "@/components/likes-you";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Likes you" };

export default function LikesPage() {
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
  if (!me) redirect("/signin?next=/dating/likes");
  if (!(await getProfile(me.id))) redirect("/dating/profile");
  return <LikesYou initial={await likesYou(me.id)} />;
}
