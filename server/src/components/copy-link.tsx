"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** Copy the plan link, and share it to WhatsApp with a ready-made message. */
export function CopyLink({ path, baseUrl, whatsappText }: { path: string; baseUrl?: string; whatsappText?: string }) {
  // The browser origin, read without a hydration mismatch (empty on the server).
  const browserOrigin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const origin = baseUrl ?? browserOrigin;
  const [copied, setCopied] = useState(false);
  const url = `${origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {whatsappText && origin && (
        <a className="btn btn-sm" target="_blank" rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`${whatsappText}${url}`)}`}>
          Share on WhatsApp
        </a>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
    </div>
  );
}
