import { api } from "@/lib/api";
import { dashboard } from "@/lib/admin";

export const GET = () => api((me) => dashboard(me));
