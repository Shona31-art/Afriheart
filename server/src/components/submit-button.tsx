"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({ children, pending, className = "btn", name, value }:
  { children: ReactNode; pending?: string; className?: string; name?: string; value?: string }) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={status.pending} name={name} value={value}>
      {status.pending ? pending ?? "Working…" : children}
    </button>
  );
}
