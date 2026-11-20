"use client";

import { photoSrc, useDataLight } from "@/lib/data-light";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ThreadData } from "@/lib/chat";
import type { Card } from "@/lib/dating";
import { ReportSheet } from "./report-sheet";
import { apiSend, formatPhone } from "@/lib/client";
import { chatDevices } from "@/lib/e2e-device";
import { securityCode } from "@/lib/e2e-crypto";
import { Avatar } from "./avatar";
import { ChatSettings, GroupAdmin } from "./chat-extras-info";
import { IconBack, IconHeart, IconLock, IconPhone, IconVideo, IconShield } from "./icons";

/** Who's in the chat, the security code to compare, and group settings. */
export function ChatInfo({ chatId, meId, chat, members, profile }: {
  chatId: string; meId: string; chat: ThreadData["chat"]; members: ThreadData["members"]; profile: Card | null;
}) {
  const { on: light } = useDataLight();
  const [reporting, setReporting] = useState(false);
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [phones, setPhones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isGroup = chat.kind === "group";
  const other = members.find((m) => m.id !== meId);

  useEffect(() => {
    chatDevices(chatId, true).then((d) => securityCode(d)).then(setCode).catch(() => setError("Couldn't load the security code. Check your connection."));
  }, [chatId]);

  async function call(kind: "voice" | "video") {
    try {
      const c = await apiSend<{ id: string }>("/api/calls", "POST", { chat_id: chatId, kind });
      router.push(`/call/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="page">
      <div className="mb-4 flex items-center gap-1">
        <Link href={`/chats/${chatId}`} className="icon-btn -ml-3" aria-label="Back to the chat"><IconBack /></Link>
        <h1 className="display text-2xl">{isGroup ? "Group info" : chat.is_match ? "Your match" : "Contact info"}</h1>
      </div>

      <section className="mb-6 flex flex-col items-center gap-2 text-center">
        {profile?.photos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(profile.photos[0], light)} alt={`${profile.name}'s photo`} className="h-28 w-28 rounded-full object-cover" />
        ) : (
          <Avatar name={chat.title} seed={chatId} group={isGroup} size={88} />
        )}
        <p className="display text-2xl">{profile ? `${profile.name}, ${profile.age}` : chat.title}</p>
        {profile?.verified && <p className="flex items-center gap-1 text-sm font-semibold text-accent"><IconShield size={16} /> Photo verified</p>}
        <p className="text-sm text-muted">{isGroup ? `${members.length} people` : chat.is_match ? ([profile?.area, profile?.distance].filter(Boolean).join(" · ") || "Matched on Afriheart") : other ? formatPhone(other.phone) : ""}</p>
        <div className="mt-2 flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => call("voice")}><IconPhone size={18} /> Voice call</button>
          <button className="btn btn-ghost btn-sm" onClick={() => call("video")}><IconVideo size={18} /> Video call</button>
        </div>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">{error}</p>}

      {profile && (
        <section aria-labelledby="sec-profile" className="card mb-4 flex flex-col gap-3">
          <h2 id="sec-profile" className="font-semibold">About {profile.name}</h2>
          {profile.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {profile.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={photoSrc(p, light)} alt={`${profile.name}, photo ${i + 1}`} className="h-36 w-28 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          )}
          {profile.bio && <p className="text-sm">{profile.bio}</p>}
          {profile.compat.score !== null ? (
            <div className="rounded-xl border border-line p-3 text-sm" data-match-score={profile.compat.score}>
              <p className="mb-1 flex items-center gap-1.5 font-semibold"><IconHeart size={16} className="text-accent" /> {profile.compat.score}% match</p>
              {profile.compat.shared.length > 0 && <p><span className="font-semibold">You both</span> {profile.compat.shared.join(", ")}.</p>}
              {profile.compat.differ.length > 0 && <p className="mt-1 text-muted">Worth talking about: {profile.compat.differ.join(", ")}.</p>}
              <p className="mt-1 text-xs text-muted">Based on {profile.compat.common} questions you both answered.</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Answer the <Link href="/dating/questions" className="font-semibold text-accent underline">compatibility questions</Link> to see your match % (you need 5 in common).</p>
          )}
          <p className="rounded-xl bg-accent-soft/60 px-3 py-2 text-sm"><strong>Date idea:</strong> {profile.date_idea}</p>
          <p className="text-xs text-muted">Your phone numbers stay private. Keep chatting here until you&apos;re comfortable, and meet somewhere public. <Link href="/dating/safety" className="font-semibold text-accent underline">Dating safety</Link></p>
        </section>
      )}

      {!isGroup && (
        <Link href={`/chats/${chat.id}/us`} className="card mb-3 flex items-center gap-3" data-couple-link>
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-2xl text-white">♥</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Couple space</span>
            <span className="block text-sm text-muted">Your question of the day, days together, your next date and anniversary.</span>
          </span>
        </Link>
      )}
      {!isGroup && (
        <Link href={`/chats/${chat.id}/az`} className="card mb-4 flex items-center gap-3">
          <span aria-hidden className="display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg text-accent">A–Z</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Alphabet date ideas</span>
            <span className="block text-sm text-muted">A date for every letter, from Aquarium to Zoo, kept as a photo album you can export.</span>
          </span>
        </Link>
      )}

      {isGroup && <GroupAdmin chatId={chatId} me={meId} chat={chat} members={members} onError={setError} />}
      <ChatSettings chatId={chatId} me={meId} chat={chat} onError={setError} />

      <section aria-labelledby="sec-code" className="card mb-4">
        <h2 id="sec-code" className="mb-2 flex items-center gap-2 font-semibold"><IconLock size={18} /> Security code</h2>
        <p className="sr-only">{code ?? ""}</p>
        <div aria-hidden className="grid grid-cols-4 gap-x-3 gap-y-1 font-mono text-[15px] leading-7" data-security-code={code ?? ""}>
          {code ? code.split(" ").map((g, i) => <span key={i}>{g}</span>) : <span className="col-span-4">Loading…</span>}
        </div>
        <p className="mt-2 text-sm text-muted">
          Compare these numbers with {isGroup ? "everyone in the group" : other?.name.split(" ")[0] ?? "them"} in person or on a call.
          If they match, nobody (not even Afriheart) can read your messages or listen to your calls. The code changes when someone starts using a new phone.
        </p>
      </section>

      {isGroup && (
        <section aria-labelledby="sec-people" className="card mb-4">
          <h2 id="sec-people" className="mb-2 font-semibold">{members.length} people</h2>
          <ul className="mb-3 flex flex-col">
            {members.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-line/70 py-2 last:border-0">
                <Avatar name={p.name} seed={p.id} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.id === meId ? "You" : p.name}</span>
                  <span className="block text-xs text-muted">{formatPhone(p.phone)}</span>
                </span>
                {p.role === "admin" && <span className="status status-done">Admin</span>}
              </li>
            ))}
          </ul>
          {chat.is_admin && (
            <form className="flex gap-2" onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiSend(`/api/chats/${chatId}/members`, "POST", { phones: phones.split(/[\n,;]+/) });
                setPhones("");
                router.refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}>
              <label className="sr-only" htmlFor="add-phones">Add people by mobile number</label>
              <input id="add-phones" className="field py-2" type="tel" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="Add by number, e.g. 082 123 4567" />
              <button className="btn btn-sm" disabled={busy || !phones.trim()}>Add</button>
            </form>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        {chat.is_match && other && (
          <>
            <button className="btn btn-ghost justify-start" onClick={async () => {
              if (!confirm(`Unmatch ${chat.title}? This chat disappears for both of you.`)) return;
              await apiSend("/api/dating/unmatch", "POST", { chat_id: chatId }).catch(() => undefined);
              router.replace("/");
            }}>Unmatch</button>
            <button className="btn btn-ghost justify-start text-danger" onClick={() => setReporting(true)}>Report or block {chat.title.split(" ")[0]}</button>
          </>
        )}
        {!chat.is_match && other && !isGroup && (
          <button className="btn btn-ghost justify-start text-danger" onClick={() => setReporting(true)}>Block or report</button>
        )}
        <button className="btn btn-ghost justify-start" onClick={() => {
          const data = { title: "Afriheart", text: "Let's chat and make plans on Afriheart", url: location.origin };
          if (navigator.share) navigator.share(data).catch(() => undefined);
          else navigator.clipboard?.writeText(`${data.text}: ${data.url}`).then(() => setError("Invite link copied."), () => undefined);
        }}>Invite friends to Afriheart</button>
        {isGroup && (
          <button className="btn btn-ghost justify-start text-danger" onClick={async () => {
            if (!confirm(`Leave "${chat.title}"? You'll stop getting its messages.`)) return;
            await apiSend(`/api/chats/${chatId}/members`, "DELETE").catch(() => undefined);
            router.replace("/");
          }}>Leave group</button>
        )}
      </section>
      {reporting && other && (
        <ReportSheet personId={other.id} name={chat.title.split(" ")[0]} onClose={() => setReporting(false)} onDone={() => router.replace("/")} />
      )}
    </main>
  );
}
