import { NextResponse } from "next/server";
import { handlePayfastItn } from "@/lib/plus";

/**
 * Payfast's payment notification (ITN). Payfast's servers post here, not people, so there's no
 * sign-in: every notification is checked (signature, sender, amount, Payfast's confirmation)
 * before a pass is unlocked. Payfast only needs a 200 back.
 */
export const POST = async (req: Request) => {
  const raw = (await req.text()).slice(0, 20_000);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req.headers.get("x-real-ip") ?? "");
  try {
    const result = await handlePayfastItn(raw, ip);
    if (result !== "complete") console.warn("[payfast] ITN:", result);
  } catch (e) {
    console.error("[payfast] ITN failed", e);
  }
  return new NextResponse(null, { status: 200 });
};
