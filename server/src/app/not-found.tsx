import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page flex flex-1 flex-col justify-center">
      <h1 className="display text-3xl">This page isn&apos;t here</h1>
      <p className="mt-2 text-muted">The link may be wrong, or you may not have access to it.</p>
      <Link href="/" className="btn mt-6 self-start">Go to your chats</Link>
    </main>
  );
}
