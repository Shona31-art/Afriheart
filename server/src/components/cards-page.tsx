"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client";
import type { CardGameView } from "@/lib/cards";
import { CardGame } from "./card-game";
import { IconBack, IconPhone, IconVideo } from "./icons";

/** Talking cards in a chat, with a quick way to start a call and play face to face. */
export function CardsPage({ chatId, meId, title, initial }: { chatId: string; meId: string; title: string; initial: CardGameView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function call(kind: "voice" | "video") {
    try {
      const c = await apiSend<{ id: string }>("/api/calls", "POST", { chat_id: chatId, kind });
      router.push(`/call/${c.id}?cards=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the call.");
    }
  }
  return (
    <main className="page flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Link href={`/chats/${chatId}`} className="icon-btn -ml-3" aria-label="Back to chat"><IconBack /></Link>
        <div className="min-w-0">
          <h1 className="display text-2xl leading-tight">Talking cards</h1>
          <p className="truncate text-sm text-muted">with {title}</p>
        </div>
      </div>
      <CardGame chatId={chatId} meId={meId} initial={initial} />
      <div className="rounded-2xl border border-line p-3">
        <p className="text-sm font-semibold">Better face to face</p>
        <p className="text-sm text-muted">{"Start a call and the cards come with you. You'll both see each card as it's turned over."}</p>
        <div className="mt-2 flex gap-2">
          <button className="btn btn-ghost btn-sm flex-1" onClick={() => call("video")}><IconVideo size={18} /> Video call</button>
          <button className="btn btn-ghost btn-sm flex-1" onClick={() => call("voice")}><IconPhone size={18} /> Voice call</button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </main>
  );
}
