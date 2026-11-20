import { NextResponse } from "next/server";
import { getSessionPersonId } from "@/lib/session";
import { gifFile } from "@/lib/gifs";

/** One GIF, fetched from GIPHY by the server (so GIPHY doesn't see the phone). Signed-in people only. */
export async function GET(req: Request) {
  if (!(await getSessionPersonId())) return new NextResponse("Please sign in.", { status: 401 });
  const u = new URL(req.url).searchParams.get("u") ?? "";
  const file = await gifFile(u);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.bytes, { headers: { "content-type": file.type, "cache-control": "private, max-age=86400", "content-length": String(file.bytes.byteLength) } });
}
