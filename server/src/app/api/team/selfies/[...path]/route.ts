import { NextResponse } from "next/server";
import { getSessionPersonId } from "@/lib/session";
import { canSeeSelfie } from "@/lib/team";
import { readMedia } from "@/lib/media";

/** Verification selfies: only the Afriheart team, never cached. */
export async function GET(_req: Request, ctx: RouteContext<"/api/team/selfies/[...path]">) {
  const { path } = await ctx.params;
  const name = path.join("/");
  const me = await getSessionPersonId();
  if (!me || path[0] !== "selfies" || !(await canSeeSelfie(me, name).catch(() => false))) return new NextResponse("Not found", { status: 404 });
  const bytes = await readMedia(name);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
}
