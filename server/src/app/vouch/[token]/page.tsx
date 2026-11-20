import Link from "next/link";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { DomainError } from "@/lib/domain";
import { RELATIONS, VOUCH_MAX, vouchInvite } from "@/lib/vouch";
import { VouchForm } from "@/components/vouch-form";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Vouch for a friend" };

export default function VouchPage({ params }: PageProps<"/vouch/[token]">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/vouch/[token]">["params"] }) {
  const { token } = await params;
  const me = await getSessionPersonId();
  const info = await vouchInvite(token, me).catch((e) => (e instanceof DomainError ? e.message : Promise.reject(e)));
  if (typeof info === "string") {
    return (
      <div className="card">
        <h1 className="display mb-1 text-2xl">Vouch link</h1>
        <p className="text-muted">{info}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="label">Afriheart</p>
        <h1 className="display text-3xl">Vouch for {info.first_name}</h1>
        <p className="mt-1 text-muted">{info.first_name} is on Afriheart, a dating app about real dates. Write a few kind, true words about them: what they&apos;re like as a friend, and why someone would be lucky to date them.</p>
      </div>
      {info.self ? (
        <p className="card text-sm">This is your own vouch link. Send it to a friend (WhatsApp works well) so they can vouch for you.</p>
      ) : !me ? (
        <div className="card flex flex-col gap-2">
          <p className="text-sm">Sign in with your number first, so {info.first_name} knows the vouch is really from you. It takes a minute, and you don&apos;t need a dating profile.</p>
          <Link href={`/signin?next=${encodeURIComponent(`/vouch/${token}`)}`} className="btn self-start">Sign in to vouch</Link>
        </div>
      ) : (
        <VouchForm token={token} name={info.first_name} relations={RELATIONS} max={VOUCH_MAX} existing={info.existing} />
      )}
      <p className="text-xs text-muted">{info.first_name} sees your vouch first and chooses whether it shows on their profile. People see your first name only, never your number.</p>
    </div>
  );
}
