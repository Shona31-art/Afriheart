import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { submitSelfie } from "@/lib/team";

/** multipart: file (a JPEG taken live in the app), consent ("yes"). */
export const POST = async (req: Request) => {
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No selfie was attached.");
    if (file.type !== "image/jpeg") throw new DomainError("Take the selfie in the app.");
    if (file.size > 4 * 1024 * 1024) throw new DomainError("That selfie is too big.");
    return submitSelfie(me, new Uint8Array(await file.arrayBuffer()), form?.get("consent") === "yes");
  });
};
