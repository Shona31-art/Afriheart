import { api, body, s } from "@/lib/api";
import { announcements, postAnnouncement } from "@/lib/admin";

export const GET = () => api((me) => announcements(me));
/** { text, kind: "info" | "warning", hours? } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => postAnnouncement(me, s(b.text), s(b.kind), typeof b.hours === "number" ? b.hours : null));
};
