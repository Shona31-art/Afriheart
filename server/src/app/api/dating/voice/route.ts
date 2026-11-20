import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { saveOwnedMedia } from "@/lib/media";

const TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"];

/** Upload a voice prompt (up to 30 seconds). Returns its path for the profile. */
export const POST = async (req: Request) => {
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No recording was attached.");
    const type = file.type.split(";")[0];
    if (!TYPES.includes(type)) throw new DomainError("That recording format isn't supported.");
    if (file.size > 2 * 1024 * 1024) throw new DomainError("That recording is too long.");
    return { path: await saveOwnedMedia(me, "profile", "profiles", new Uint8Array(await file.arrayBuffer()), type) };
  });
};
