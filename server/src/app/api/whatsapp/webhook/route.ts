import { NextResponse } from "next/server";
import { handleWhatsAppWebhook, validMetaSignature, whatsappConfig } from "@/lib/whatsapp-signin";

// Meta's WhatsApp webhook (Cloud API). Set it up in the Meta app: WhatsApp → Configuration →
// Callback URL https://<site>/api/whatsapp/webhook, Verify token = WHATSAPP_VERIFY_TOKEN,
// then subscribe to "messages". Afriheart only reads messages; it never replies.

export async function GET(req: Request) {
  const cfg = whatsappConfig();
  const q = new URL(req.url).searchParams;
  if (cfg && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === cfg.verifyToken) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Forbidden", { status: 403 });
  try {
    await handleWhatsAppWebhook(JSON.parse(raw));
  } catch (e) {
    // Answer 200 anyway: Meta would otherwise keep retrying the same message.
    console.error("[whatsapp webhook]", (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
