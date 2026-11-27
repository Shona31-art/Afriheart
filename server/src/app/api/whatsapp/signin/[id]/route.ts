import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { whatsappStatus } from "@/lib/whatsapp-signin";

/** The waiting screen asks this every couple of seconds: has their WhatsApp message arrived? */
export async function GET(_req: Request, ctx: RouteContext<"/api/whatsapp/signin/[id]">) {
  const { id } = await ctx.params;
  const secret = (await cookies()).get("wa_signin")?.value;
  const status = await whatsappStatus(id, secret);
  return NextResponse.json(status ?? { status: "expired", hint: null }, { headers: { "cache-control": "no-store" } });
}
