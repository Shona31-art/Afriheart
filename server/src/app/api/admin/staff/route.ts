import { api, body, s } from "@/lib/api";
import { setStaff, staffList } from "@/lib/admin";

export const GET = () => api((me) => staffList(me));
/** { phone, role: "super_admin" | "moderator" | "support" | null } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => setStaff(me, s(b.phone), b.role === null ? null : s(b.role)));
};
