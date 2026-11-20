"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend } from "@/lib/client";

/** Stands in for Payfast's page in test mode. */
export function TestCheckout({ id, amount }: { id: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go(outcome: "pay" | "cancel") {
    setBusy(true);
    await apiSend("/api/plus/test-checkout", "POST", { id, outcome });
    router.push(outcome === "pay" ? `/plus?paid=${id}` : "/plus?cancelled=1");
  }
  return (
    <div className="card flex flex-col gap-3">
      <h1 className="display text-2xl">Test checkout</h1>
      <p className="text-sm text-muted">This stands in for Payfast while testing. No real money moves.</p>
      <p className="text-lg font-semibold">{amount}</p>
      <button className="btn" disabled={busy} onClick={() => go("pay")}>Pay (test)</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => go("cancel")}>Cancel</button>
    </div>
  );
}
