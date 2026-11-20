import { api, body } from "@/lib/api";
import { notifyMe, venueLead } from "@/lib/deals";
import { DomainError } from "@/lib/domain";

/** Date deals are coming soon: { kind: "notify", city } | { kind: "venue", venue, city, contact } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api(async (me) => {
    if (b.kind === "notify") return notifyMe(me, b.city);
    if (b.kind === "venue") return venueLead(me, b);
    throw new DomainError("Unknown request.");
  });
};
