import { Suspense } from "react";
import { adminPasswordSignIn } from "../../actions";
import { Notice, Skeleton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { adminPasswordOn } from "@/lib/admin-login";

export const metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

/** Super admins only: number + private admin password (SUPER_ADMIN_PASSWORD), no code. */
export default function AdminSignInPage({ searchParams }: PageProps<"/signin/admin">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="display text-3xl">Admin sign-in</h1>
      <Suspense fallback={<Skeleton />}>
        <AdminForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AdminForm({ searchParams }: { searchParams: PageProps<"/signin/admin">["searchParams"] }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  if (!adminPasswordOn()) {
    return (
      <div className="card text-sm">
        Admin password sign-in is off. Add <code>SUPER_ADMIN_PASSWORD</code> (16+ characters) in Vercel and redeploy, or <a className="font-semibold text-accent underline" href="/signin">sign in with a code</a>.
      </div>
    );
  }
  return (
    <form action={adminPasswordSignIn} className="card flex flex-col gap-3">
      <Notice error={error} />
      <label className="flex flex-col gap-1">
        <span className="label">Your name</span>
        <input className="field" name="name" autoComplete="given-name" maxLength={60} placeholder="Only needed the first time" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Mobile number</span>
        <input className="field" name="phone" type="tel" autoComplete="tel" required placeholder="082 123 4567" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Admin password</span>
        <input className="field" name="password" type="password" autoComplete="current-password" required minLength={16} />
      </label>
      <SubmitButton pending="Signing in…">Sign in</SubmitButton>
      <p className="text-xs text-muted">Only for Afriheart&apos;s super admins. Everyone else <a className="font-semibold text-accent underline" href="/signin">signs in here</a>.</p>
    </form>
  );
}
