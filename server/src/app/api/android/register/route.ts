import { z } from "zod";
import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { forgetDevice, registerDevice } from "@/lib/fcm";

const Body = z.object({ token: z.string().min(20).max(4096), version: z.number().int().min(0).max(1e9).optional() });

async function parse(req: Request) {
  // JSON only: a plain cross-site form can't send this.
  if (!req.headers.get("content-type")?.includes("application/json")) return null;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** The Android app tells the server where to ring this person's calls. */
export const POST = async (req: Request) => {
  const b = await parse(req);
  return api(async (me) => {
    if (!b) throw new DomainError("Expected a token.");
    await registerDevice(me, b.token, b.version ?? null);
  });
};

/** Signed out on this phone: stop sending here. */
export const DELETE = async (req: Request) => {
  const b = await parse(req);
  return api(async (me) => {
    if (!b) throw new DomainError("Expected a token.");
    await forgetDevice(me, b.token);
  });
};
