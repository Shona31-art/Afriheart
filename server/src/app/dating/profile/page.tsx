import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { getProfile } from "@/lib/dating";
import { ProfileEditor } from "@/components/profile-editor";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Your dating profile" };

export default function DatingProfilePage() {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Editor />
    </Suspense>
  );
}

async function Editor() {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/dating/profile");
  const profile = await getProfile(me.id);
  return <ProfileEditor initial={profile} fallbackName={me.name.split(" ")[0]} />;
}
