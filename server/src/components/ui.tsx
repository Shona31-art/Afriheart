import type { ReactNode } from "react";
import type { ActionStatus } from "@/lib/types";

export function Header({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      {eyebrow && <p className="label mb-1">{eyebrow}</p>}
      <h1 className="display text-[2.15rem] leading-tight">{title}</h1>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </header>
  );
}

export function Notice({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <p role={error ? "alert" : "status"}
      className={`mb-4 rounded-xl px-4 py-3 text-sm ${error ? "bg-warm-soft text-warm-ink" : "bg-accent-soft text-accent"}`}>
      {error ?? success}
    </p>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between px-0.5">
        <h2 className="display text-[1.35rem] text-ink">{title}</h2>
        {aside}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

const STATUS_LABEL: Record<ActionStatus, string> = {
  suggested: "Suggested", prepared: "Prepared", authorised: "Authorised", done: "Done", failed: "Failed",
};

export function StatusTag({ status }: { status: ActionStatus }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Skeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-line" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/70" />
      <div className="h-24 animate-pulse rounded-2xl bg-line/50" />
    </div>
  );
}

export function rand(n: number | null): string {
  return n == null ? "" : n === 0 ? "Free" : `~R${n}`;
}
