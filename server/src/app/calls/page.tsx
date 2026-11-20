import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson } from "@/lib/domain";
import { callHistory } from "@/lib/calls";
import { Skeleton } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { listTime, mmss } from "@/lib/client";

export const metadata = { title: "Calls" };

export default function CallsPage() {
  return (
    <main className="page">
      <h1 className="display mb-4 text-3xl">Calls</h1>
      <Suspense fallback={<Skeleton />}>
        <History />
      </Suspense>
    </main>
  );
}

async function History() {
  const me = await getPerson(await getSessionPersonId());
  if (!me) redirect("/signin?next=/calls");
  const calls = await callHistory(me.id);
  if (!calls.length) {
    return (
      <div className="card">
        <p className="font-semibold">No calls yet</p>
        <p className="text-sm text-muted">Open any chat and tap 📞 or 📹 to call. Calls go straight between phones over the internet.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {calls.map((c) => (
        <li key={c.id}>
          <Link href={`/chats/${c.chat_id}`} className="flex items-center gap-3 border-b border-line/70 py-2.5">
            <Avatar name={c.title} seed={c.chat_id} />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold ${c.missed ? "text-danger" : ""}`}>{c.title}</p>
              <p className="text-sm text-muted">
                {c.outgoing ? "↗" : c.missed ? "↙ Missed" : "↙"} {listTime(c.at)}{c.duration_ms != null ? ` · ${mmss(c.duration_ms)}` : ""}
              </p>
            </div>
            <span className="text-xl" aria-label={c.kind === "video" ? "Video call" : "Voice call"}>{c.kind === "video" ? "📹" : "📞"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
