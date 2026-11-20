import "server-only";
import { NextResponse } from "next/server";
import { DomainError, getPerson } from "./domain";
import { getSessionPersonId } from "./session";

/** JSON route wrapper: signed-in person, friendly errors, no caching. */
export async function api<T>(fn: (personId: string) => Promise<T>): Promise<NextResponse> {
  const personId = await getSessionPersonId();
  if (!personId || !(await getPerson(personId))) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  try {
    const data = await fn(personId);
    return NextResponse.json(data ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const MAX_JSON = 512 * 1024;

/** Reads a JSON body of at most 512 KB (the proxy also refuses big bodies by their declared size). */
/** Like api(), for public pages that work without signing in (the compatibility quiz). */
export async function publicApi<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    if (!req.body) return {};
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_JSON) {
        await reader.cancel();
        return {};
      }
      chunks.push(value);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const s = (v: unknown) => (typeof v === "string" ? v : "");

export async function requestOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
