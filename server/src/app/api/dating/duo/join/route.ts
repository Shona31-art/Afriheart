import { api, body, s } from "@/lib/api";
import { duoStatus, joinDuo } from "@/lib/double";

/** Accept a friend's invite: { code } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    await joinDuo(me, s(b.code));
    return duoStatus(me);
  });
};
