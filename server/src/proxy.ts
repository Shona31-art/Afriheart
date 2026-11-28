import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { limit, type LimitName } from "@/lib/rate-limit";
import { DomainError } from "@/lib/domain";
import { gate } from "@/lib/membership";

// In front of every API call that changes something:
//   1. Same-site only: requests from other websites are refused (defence in depth on top of SameSite cookies).
//   2. Size: bodies over the limit are refused before they're read.
//   3. Rate limits per person (or per network address when signed out).

const KB = 1024;
const UPLOAD_PATHS = [/^\/api\/chats\/[^/]+\/media$/, /^\/api\/dating\/photos$/, /^\/api\/dating\/voice$/, /^\/api\/dating\/verify\/selfie$/, /^\/api\/status\/media$/, /^\/api\/support\/attachments$/];
const JSON_LIMIT = 512 * KB; // an encrypted message envelope is at most ~200 KB
const UPLOAD_LIMIT = 13 * 1024 * KB;

/** Which limit an API call counts against. Every change also counts against "write". */
function limitsFor(path: string): LimitName[] {
  const named: [RegExp, LimitName][] = [
    [/^\/api\/dating\/(duo\/)?swipe$/, "swipe"],
    [/^\/api\/dating\/report$/, "report"],
    [/^\/api\/chats\/[^/]+\/messages$/, "message"],
    [/^\/api\/chats\/[^/]+\/media$/, "upload"],
    [/^\/api\/dating\/(photos|voice)$/, "photo"],
    [/^\/api\/dating\/verify(\/selfie)?$/, "verify"],
    [/^\/api\/chats$/, "chat"],
    [/^\/api\/chats\/[^/]+\/plan$/, "plan"],
    [/^\/api\/calls$/, "call"],
    [/^\/api\/quiz(\/[^/]+)?$/, "quiz"],
    [/^\/api\/vouch(es)?(\/.*)?$/, "vouch"],
    [/^\/api\/plus\/checkout$/, "checkout"],
    [/^\/api\/join\/[^/]+$/, "chat"],
    [/^\/api\/support$/, "support"],
    [/^\/api\/support\/attachments$/, "upload"],
    [/^\/api\/status$/, "message"],
    [/^\/api\/status\/media$/, "upload"],
  ];
  // Call set-up messages and read receipts are frequent and tiny: size-checked but not counted.
  // The gateway phone checks in every few seconds; it has its own secret instead.
  if (path === "/api/sms-gateway" || path === "/api/whatsapp/webhook") return [];
  if (/^\/api\/calls\/[^/]+\/signals$/.test(path) || /^\/api\/chats\/[^/]+\/(read|typing)$/.test(path)) return [];
  return [...named.filter(([re]) => re.test(path)).map(([, n]) => n), "write"];
}

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Afriheart is a paid app: after the free trial, only safety, support and account stay open.
  if (req.method !== "OPTIONS") {
    try {
      const g = await gate(path, req.cookies);
      if (!g.allow) {
        if (g.api) return NextResponse.json({ error: "Your free trial has ended. Choose a membership to keep using Afriheart.", membership: true }, { status: 402, headers: { "cache-control": "no-store" } });
        const url = req.nextUrl.clone();
        const [pathname, query] = g.to.split("?");
        url.pathname = pathname;
        url.search = query ? `?${query}` : "";
        return NextResponse.redirect(url);
      }
    } catch (e) {
      console.error("[proxy] membership check failed", e); // never lock people out because the check failed
    }
  }

  if (!path.startsWith("/api/") || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();

  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === host; } catch { ok = false; }
    if (!ok) return deny(403, "Requests from other websites aren't allowed.");
  } else if (req.headers.get("sec-fetch-site") === "cross-site") {
    return deny(403, "Requests from other websites aren't allowed.");
  }

  const max = UPLOAD_PATHS.some((re) => re.test(path)) ? UPLOAD_LIMIT : JSON_LIMIT;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > max) return deny(413, "That's too big to send.");

  const token = req.cookies.get("common_session")?.value;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const who = token ? `s:${createHash("sha256").update(token).digest("hex").slice(0, 32)}` : `ip:${ip}`;
  try {
    for (const name of limitsFor(path)) await limit(name, who);
  } catch (e) {
    if (e instanceof DomainError) return deny(429, e.message);
    console.error("[proxy] rate limit check failed", e); // never lock people out because the counter failed
  }
  return NextResponse.next();
}

// Every page and API call, but not Next's own files or static files (anything with a file extension).
export const config = { matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"] };
