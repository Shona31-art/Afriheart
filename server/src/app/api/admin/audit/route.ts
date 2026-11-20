import { api } from "@/lib/api";
import { auditLog } from "@/lib/admin";

export const GET = () => api((me) => auditLog(me));
