import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { saveMediaAt, saveOwnedMedia, smallCopyOf } from "@/lib/media";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Upload one profile photo (resized on the phone). Returns its path for the profile. */
export const POST = async (req: Request) => {
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No photo was attached.");
    if (!TYPES.includes(file.type)) throw new DomainError("Use a JPEG, PNG or WebP photo.");
    if (file.size > 5 * 1024 * 1024) throw new DomainError("That photo is too big.");
    const path = await saveOwnedMedia(me, "profile", "profiles", new Uint8Array(await file.arrayBuffer()), file.type);
    // The small copy for data-light mode (made on the phone too). Optional: older apps don't send it.
    const small = form?.get("small");
    if (small instanceof File && small.size > 0 && small.size <= 300 * 1024 && small.type === "image/jpeg") {
      await saveMediaAt(smallCopyOf(path)!, new Uint8Array(await small.arrayBuffer()), "image/jpeg").catch((e) => console.warn("[photos] small copy", e));
    }
    return { path };
  });
};
