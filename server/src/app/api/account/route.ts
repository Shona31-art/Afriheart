import { api, body, s } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { deleteAccount } from "@/lib/account";
import { clearSession } from "@/lib/session";

/** Delete my account for good: { confirm: "DELETE" } */
export const DELETE = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    if (s(b.confirm) !== "DELETE") throw new DomainError("Type DELETE to confirm.");
    await deleteAccount(me);
    await clearSession();
    return { deleted: true };
  });
};
