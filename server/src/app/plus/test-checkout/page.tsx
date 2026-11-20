import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { paymentProvider } from "@/lib/plus";
import { getStore } from "@/lib/store";
import { TestCheckout } from "@/components/test-checkout";

export const metadata = { title: "Test checkout" };

/** A pretend checkout page for testing on a computer (only with ALLOW_TEST_PAYMENTS=yes-insecure). */
export default function TestCheckoutPage({ searchParams }: PageProps<"/plus/test-checkout">) {
  return (
    <main className="page">
      <Suspense fallback={null}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/plus/test-checkout">["searchParams"] }) {
  // Read the request first, so this is decided when someone visits, never frozen in at build time.
  const id = (await searchParams).id;
  const me = await getSessionPersonId();
  if (paymentProvider() !== "test") notFound();
  if (!me) redirect("/signin?next=/plus");
  const p = typeof id === "string" ? await getStore().get("payments", id) : null;
  if (!p || p.person_id !== me) notFound();
  return <TestCheckout id={p.id} amount={`R${(p.amount_cents / 100).toFixed(2)}`} />;
}
