import { NextResponse } from "next/server";
import { exchange, gatewayAuthorized, gatewayToken, type GatewayUpdate } from "@/lib/sms-gateway";

// The "Afriheart Codes" phone app checks in here every few seconds (see src/lib/sms-gateway.ts).

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  if (!gatewayToken()) return json({ error: true, message: "The phone gateway isn't switched on (SMS_GATEWAY_TOKEN)." }, 404);
  if (!gatewayAuthorized(req.headers.get("authorization"))) return json({ error: true, message: "Wrong gateway key." }, 401);
  return json({ ok: true, gateway: "afriheart" });
}

export async function POST(req: Request) {
  if (!gatewayToken()) return json({ error: true, message: "The phone gateway isn't switched on (SMS_GATEWAY_TOKEN)." }, 404);
  if (!gatewayAuthorized(req.headers.get("authorization"))) return json({ error: true, message: "Wrong gateway key." }, 401);
  let updates: GatewayUpdate[] = [];
  try {
    const body = (await req.json()) as { updates?: unknown };
    if (Array.isArray(body?.updates)) updates = body.updates as GatewayUpdate[];
  } catch {
    // An empty check-in is fine.
  }
  try {
    return json({ messages: await exchange(updates) });
  } catch (e) {
    console.error("[sms-gateway]", (e as Error).message);
    return json({ error: true, message: "Afriheart couldn't reach its database. Trying again shortly." }, 503);
  }
}
