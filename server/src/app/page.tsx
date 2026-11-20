import Link from "next/link";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { listChats } from "@/lib/chat";
import { Skeleton } from "@/components/ui";
import { ChatList } from "@/components/chat-list";

export default function ChatsPage() {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const person = await getPerson(await getSessionPersonId());
  if (!person) return <Welcome />;
  const chats = await listChats(person.id);
  return (
    <main className="flex flex-1 flex-col pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-paper/95 px-4 pb-2 pt-5 backdrop-blur lg:hidden">
        <h1 className="display text-3xl">Chats</h1>
        <div className="flex gap-2">
          <Link href="/calls" className="btn btn-ghost btn-sm">Calls</Link>
          <Link href="/chats/new" className="btn btn-sm">+ New chat</Link>
        </div>
      </header>
      <div className="lg:hidden"><ChatList initial={chats} personId={person.id} /></div>
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 px-8 text-center lg:flex">
        <h1 className="display text-2xl">Pick a chat</h1>
        <p className="max-w-sm text-sm text-muted">Choose a conversation on the left, or start a new one. Messages and calls are end-to-end encrypted on this computer too.</p>
      </div>
    </main>
  );
}

function Welcome() {
  return (
    <main className="page justify-center">
      <h1 className="display flex items-center gap-3 text-5xl leading-none">{/* eslint-disable-next-line @next/next/no-img-element -- a tiny SVG logo */}
<img src="/afriheart-mark.svg" alt="" width={52} height={52} className="shrink-0" />Afriheart</h1>
      <p className="display mt-3 text-2xl text-muted">Meet someone over a real date, not endless swiping.</p>
      <ol className="mt-8 flex flex-col gap-3">
        {[
          ["Say yes to a date", "Every profile has a date idea, like a sunrise walk at Umhlanga. Like someone, or say yes to their date."],
          ["Match and talk safely", "Matches get a private, end-to-end encrypted chat with voice and video calls. Your number stays hidden."],
          ["Make it happen", "Afriheart turns the date into a plan: when, where, and a way to tell a friend where you'll be."],
        ].map(([t, d], i) => (
          <li key={t} className="card flex gap-3">
            <span className="display text-2xl text-accent">{i + 1}</span>
            <div>
              <p className="font-semibold">{t}</p>
              <p className="text-sm text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/signin?next=/discover" className="btn mt-8 self-start">Get started</Link>
      <p className="mt-3 text-xs text-muted">18+ only. Also for friends: chats, groups and plans work for everyone.</p>
    </main>
  );
}
