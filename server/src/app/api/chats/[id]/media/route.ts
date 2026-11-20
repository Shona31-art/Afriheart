import { api } from "@/lib/api";
import { membership } from "@/lib/chat";
import { DomainError } from "@/lib/domain";
import { saveOwnedMedia } from "@/lib/media";

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Upload an ENCRYPTED photo or voice note (multipart: file). The server stores
 * bytes it can't read and returns where they are; the key travels inside the
 * end-to-end encrypted message that follows.
 */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/media">) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  return api(async (me) => {
    await membership(id, me);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) throw new DomainError("No file was attached.");
    if (file.size > MAX_BYTES) throw new DomainError("That file is too big.");
    return { path: await saveOwnedMedia(me, "chat", id, new Uint8Array(await file.arrayBuffer()), "application/octet-stream") };
  });
};
