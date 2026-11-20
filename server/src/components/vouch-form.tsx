"use client";

import Link from "next/link";
import { useState } from "react";
import { apiSend } from "@/lib/client";

export function VouchForm({ token, name, relations, max, existing }: {
  token: string; name: string; relations: Record<string, string>; max: number;
  existing: { relation: string; text: string; status: string } | null;
}) {
  const [relation, setRelation] = useState(existing?.relation ?? "friend");
  const [text, setText] = useState(existing?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="card" role="status">
        <p className="display text-xl">Thank you!</p>
        <p className="text-sm text-muted">{name} will see your vouch and can add it to their profile.</p>
        <Link href="/" className="btn btn-ghost btn-sm mt-3">Have a look at Afriheart</Link>
      </div>
    );
  }
  return (
    <form className="card flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await apiSend(`/api/vouch/${token}`, "POST", { relation, text });
        setSent(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }}>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">How do you know {name}?</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(relations).map(([id, label]) => (
            <label key={id} className="chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
              <input type="radio" name="relation" value={id} checked={relation === id} onChange={() => setRelation(id)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Your vouch</span>
        <textarea className="field min-h-28" value={text} onChange={(e) => setText(e.target.value)} maxLength={max}
          placeholder={`e.g. Most loyal person I know. ${name} remembers everyone's birthday and makes the best potjie in Durban.`} />
        <span className="self-end text-xs text-muted">{text.length}/{max}</span>
      </label>
      {existing && <p className="text-xs text-muted">You&apos;ve vouched before. Saving sends your new words to {name} to approve again.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn" disabled={busy || text.trim().length < 10}>{busy ? "Sending…" : `Vouch for ${name}`}</button>
    </form>
  );
}
