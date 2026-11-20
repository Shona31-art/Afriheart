import { api } from "@/lib/api";
import { leads } from "@/lib/admin";

export const GET = () => api((me) => leads(me));
