import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { saveOwnedMedia } from "@/lib/media";

const MAX_BYTES = 8 * 1024 * 1024;

/** An ENCRYPTED status photo (multipart: file). */
export const POST = async (req: Request) => {
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No file was attached.");
    if (file.size > MAX_BYTES) throw new DomainError("That photo is too big.");
    return { path: await saveOwnedMedia(me, "status", `status-${me}`, new Uint8Array(await file.arrayBuffer()), "application/octet-stream") };
  });
};
