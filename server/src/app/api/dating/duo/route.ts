import { api, body, s } from "@/lib/api";
import { createDuo, duoStatus, leaveDuo } from "@/lib/double";

/** My pair for double dates (pending invite or active), or none. */
export const GET = () => api((me) => duoStatus(me));

/** Start a pair: { idea } → the pair with an invite code to send to a friend. */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    await createDuo(me, s(b.idea));
    return duoStatus(me);
  });
};

/** Leave my pair (or cancel the invite). */
export const DELETE = () => api(async (me) => {
  await leaveDuo(me);
  return duoStatus(me);
});
