import { api } from "@/lib/api";
import { statusDevices } from "@/lib/status";

export const GET = () => api((me) => statusDevices(me));
