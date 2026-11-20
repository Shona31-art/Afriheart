import { NextResponse } from "next/server";
import { getSessionPersonId } from "@/lib/session";
import { membership } from "@/lib/chat";
import { contentTypeFor, readMedia } from "@/lib/media";

/** Photos and voice notes, only for people in that chat (status photos: for that person's contacts). */
export async function GET(_req: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const { path } = await ctx.params;
  const name = path.join("/");
  const me = await getSessionPersonId();
  if (!me) return new NextResponse("Please sign in.", { status: 401 });
  try {
    if (path[0].startsWith("support-")) {
      const { canSeeSupportFile } = await import("@/lib/support");
      if (!(await canSeeSupportFile(me, name))) throw new Error("no");
    } else if (path[0].startsWith("status-")) {
      const { canSeeStatusMedia } = await import("@/lib/status");
      if (!(await canSeeStatusMedia(me, path[0]))) throw new Error("no");
    } else {
      await membership(path[0], me);
    }
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const bytes = await readMedia(name);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": contentTypeFor(name), "cache-control": "private, max-age=31536000, immutable", "content-length": String(bytes.byteLength) },
  });
}
