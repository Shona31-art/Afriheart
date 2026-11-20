import type { ReactNode } from "react";

/** Shared layout for the privacy policy and terms. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="page">
      <article className="legal mx-auto w-full max-w-2xl">
        <h1 className="display mb-1 text-3xl">{title}</h1>
        <p className="mb-6 text-sm text-muted">Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}

/** A detail the owner still has to fill in before launch. */
export const Fill = ({ children }: { children: ReactNode }) => <mark className="rounded bg-notice px-1 text-notice-ink">[{children}]</mark>;
