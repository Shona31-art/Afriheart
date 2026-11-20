import { api, body, s } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { removeFromGroup, setAdmin } from "@/lib/chat-extras";

/** Group admins: { action: "remove" | "admin" | "unadmin" }. */
export const POST = async (req: Request, ctx: RouteContext<"/api/chats/[id]/members/[pid]">) => {
  const { id, pid } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    const action = s(b.action);
    if (action === "remove") return removeFromGroup(id, me, pid);
    if (action === "admin" || action === "unadmin") return setAdmin(id, me, pid, action === "admin");
    throw new DomainError("Unknown action.");
  });
};
