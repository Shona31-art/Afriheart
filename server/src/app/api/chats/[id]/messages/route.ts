import { api, body } from "@/lib/api";
import { sendEncrypted } from "@/lib/devices";

/**
 * { envelope }: an end-to-end encrypted message. A 400 with error
 * "devices_changed" means someone in the chat added or removed a device:
 * fetch the chat's devices again and re-encrypt. Optional: meta ("react" | "edit" | "vote") with
 * target (a message id), and media (the encrypted file's path, deleted with the message).
 */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/messages">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => ({ id: (await sendEncrypted(id, me, b.envelope, { meta: b.meta, target: b.target, media: b.media })).id }));
};
