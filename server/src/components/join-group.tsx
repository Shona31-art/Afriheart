"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client";
import { Avatar } from "./avatar";

export function JoinGroup({ token, preview }: { token: string; preview: { name: string; description: string; count: number; chat_id: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!preview) {
    return (
      <div className="card mt-8 text-center">
        <h1 className="display mb-2 text-2xl">This link doesn&apos;t work</h1>
        <p className="mb-4 text-sm text-muted">The group admin may have reset it. Ask them for a new one.</p>
        <Link href="/" className="btn">Go to chats</Link>
      </div>
    );
  }
  return (
    <div className="card mt-8 flex flex-col items-center gap-2 text-center" data-join>
      <Avatar name={preview.name} seed={preview.chat_id} group size={88} />
      <h1 className="display text-2xl">{preview.name}</h1>
      <p className="text-sm text-muted">Group · {preview.count} {preview.count === 1 ? "person" : "people"}</p>
      {preview.description && <p className="whitespace-pre-wrap text-sm">{preview.description}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">People in the group will see your name and number.</p>
      <div className="mt-2 flex gap-2">
        <Link href="/" className="btn btn-ghost">Cancel</Link>
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await apiSend<{ id: string }>(`/api/join/${encodeURIComponent(token)}`, "POST");
            router.replace(`/chats/${r.id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}>Join group</button>
      </div>
    </div>
  );
}
