import { NextResponse } from "next/server";
import { getSessionPersonId } from "@/lib/session";
import { canSeePhoto } from "@/lib/dating";
import { contentTypeFor, readMedia, smallCopyOf } from "@/lib/media";

/** Profile photos: only for signed-in people who could see that profile, its owner, and their matches. */
export async function GET(req: Request, ctx: RouteContext<"/api/dating/photos/[...path]">) {
  const { path } = await ctx.params;
  const name = path.join("/");
  const me = await getSessionPersonId();
  if (!me) return new NextResponse("Please sign in.", { status: 401 });
  if (path[0] !== "profiles" || !(await canSeePhoto(me, name).catch(() => false))) return new NextResponse("Not found", { status: 404 });
  // Data-light mode asks for the small copy; photos uploaded before it existed fall back to the full one.
  const small = new URL(req.url).searchParams.get("size") === "small" ? smallCopyOf(name) : null;
  const bytes = (small && (await readMedia(small))) || (await readMedia(name));
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": contentTypeFor(name), "cache-control": "private, max-age=300" } });
}
