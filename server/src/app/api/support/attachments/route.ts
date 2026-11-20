import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { saveOwnedMedia } from "@/lib/media";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** A screenshot for a support request (multipart: file). The team can see it, so it isn't end-to-end encrypted. */
export const POST = async (req: Request) => {
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No screenshot was attached.");
    if (file.size > 5 * 1024 * 1024) throw new DomainError("That screenshot is too big.");
    if (!TYPES.has(file.type)) throw new DomainError("Screenshots must be photos (JPEG, PNG or WebP).");
    return { path: await saveOwnedMedia(me, "support", `support-${me}`, new Uint8Array(await file.arrayBuffer()), file.type) };
  });
};
