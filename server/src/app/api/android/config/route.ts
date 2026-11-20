import { NextResponse } from "next/server";
import { androidAppConfig, fcmConfigured } from "@/lib/fcm";

/**
 * What Afriheart's Android app needs to start Firebase push (android/…/Push.kt).
 * These values are public (they're inside every copy of an app); sending still
 * needs the secret service account, which never leaves the server.
 */
export function GET() {
  const config = fcmConfigured() ? androidAppConfig() : null;
  return NextResponse.json(config ? { enabled: true, ...config } : { enabled: false }, { headers: { "cache-control": "no-store" } });
}
