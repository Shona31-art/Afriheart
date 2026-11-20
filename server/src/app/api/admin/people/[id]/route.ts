import { api, body, s } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { adminDeleteAccount, banPerson, grantPlus, personDetail, setDatingRemoved, unbanPerson } from "@/lib/admin";

type Ctx = RouteContext<"/api/admin/people/[id]">;
export const GET = async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return api((me) => personDetail(me, id));
};

/** { action: "ban" (reason) | "unban" | "remove_dating" | "restore_dating" | "grant_plus" (days, note) | "delete" (confirm) } */
export const POST = async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req);
  return api(async (me) => {
    switch (s(b.action)) {
      case "ban": return banPerson(me, id, s(b.reason));
      case "unban": return unbanPerson(me, id);
      case "remove_dating": return setDatingRemoved(me, id, true);
      case "restore_dating": return setDatingRemoved(me, id, false);
      case "grant_plus": return grantPlus(me, id, Number(b.days), s(b.note));
      case "delete": return adminDeleteAccount(me, id, s(b.confirm));
      default: throw new DomainError("Unknown action.");
    }
  });
};
