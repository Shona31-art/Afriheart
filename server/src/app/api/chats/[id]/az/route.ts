import { api, body, s } from "@/lib/api";
import { azBoard, completeAz, planAz, renameAz, setAlbum, storyAz, undoAz } from "@/lib/az";
import { DomainError } from "@/lib/domain";

/** This chat's alphabet date ideas album. */
export const GET = async (_req: Request, ctx: RouteContext<"/api/chats/[id]/az">) => {
  const { id } = await ctx.params;
  return api((me) => azBoard(id, me));
};

/**
 * { letter, action } where action is:
 *   "rename" { activity }      change the date for a letter
 *   "plan"                     draft a plan for it in the chat (returns { slug })
 *   "done"   { message_id }    tick it off with the encrypted photo just sent to the chat
 *   "story"  { message_id }    the encrypted story and rating just sent to the chat
 *   "undo"                     not done after all
 *   "album"  { style?, look? } the album's date style and design (no letter needed)
 */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/az">) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    const letter = s(b.letter);
    switch (s(b.action)) {
      case "rename": await renameAz(id, me, letter, s(b.activity)); break;
      case "plan": return { slug: await planAz(id, me, letter), board: await azBoard(id, me) };
      case "done": await completeAz(id, me, letter, s(b.message_id)); break;
      case "story": await storyAz(id, me, letter, s(b.message_id)); break;
      case "album": await setAlbum(id, me, { style: b.style, look: b.look }); break;
      case "undo": await undoAz(id, me, letter); break;
      default: throw new DomainError("Unknown action.");
    }
    return azBoard(id, me);
  });
};
