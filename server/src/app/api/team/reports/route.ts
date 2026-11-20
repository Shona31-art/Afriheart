import { api, body, s } from "@/lib/api";
import { reportQueue, reviewReport } from "@/lib/team";

/** Team only: open reports, oldest first. */
export const GET = () => api((me) => reportQueue(me));

/** Team only: { id, action: "no_action" | "remove" } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    await reviewReport(me, s(b.id), s(b.action));
    return reportQueue(me);
  });
};
