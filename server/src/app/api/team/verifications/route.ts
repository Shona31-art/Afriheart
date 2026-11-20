import { api, body, s } from "@/lib/api";
import { reviewVerification, verificationQueue } from "@/lib/team";

/** Team only: selfies waiting to be checked. */
export const GET = () => api((me) => verificationQueue(me));

/** Team only: { id, decision: "approve" | "reject", reason } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    await reviewVerification(me, s(b.id), s(b.decision), s(b.reason));
    return verificationQueue(me);
  });
};
