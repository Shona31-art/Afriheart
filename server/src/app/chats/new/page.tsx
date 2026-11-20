"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiSend } from "@/lib/client";

export default function NewChatPage() {
  return <Suspense fallback={<main className="page" />}><NewChat /></Suspense>;
}

function NewChat() {
  const router = useRouter();
  // "New group with …" from a chat's menu: the group form, with their number filled in.
  const withPhone = useSearchParams().get("group") ?? "";
  const [mode, setMode] = useState<"direct" | "group">(withPhone ? "group" : "direct");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const payload = mode === "direct"
        ? { kind: "direct", phone: String(form.get("phone")), name: String(form.get("name") ?? "") }
        : { kind: "group", name: String(form.get("group")), phones: String(form.get("phones") ?? "").split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean) };
      const { id } = await apiSend<{ id: string }>("/api/chats", "POST", payload);
      router.replace(`/chats/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/" className="text-2xl" aria-label="Back">←</Link>
        <h1 className="display text-2xl">New chat</h1>
      </div>
      <div className="mb-4 flex gap-2" role="tablist">
        {(["direct", "group"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`chip ${mode === m ? "chip-on" : ""}`}>
            {m === "direct" ? "Message someone" : "New group"}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-warm-soft px-4 py-3 text-sm text-warm-ink">{error}</p>}
      <form action={submit} className="card flex flex-col gap-3">
        {mode === "direct" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Their mobile number</span>
              <input className="field" name="phone" type="tel" required placeholder="082 123 4567" autoComplete="tel" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Their name (if they&apos;re not on Afriheart yet)</span>
              <input className="field" name="name" maxLength={60} placeholder="Thabo" />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Group name</span>
              <input className="field" name="group" required maxLength={60} placeholder="Varsity crew" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Mobile numbers, one per line</span>
              <textarea className="field min-h-28" name="phones" required defaultValue={withPhone ? `${withPhone}\n` : ""} placeholder={"082 123 4567\n083 765 4321"} />
            </label>
          </>
        )}
        <button className="btn" disabled={busy}>{busy ? "Opening…" : mode === "direct" ? "Open chat" : "Create group"}</button>
        <p className="text-xs text-muted">People who aren&apos;t on Afriheart yet see your messages when they sign in with that number. Share the app with them from the chat.</p>
      </form>
    </main>
  );
}
