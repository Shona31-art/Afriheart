import { api } from "@/lib/api";
import { discover } from "@/lib/dating";

export const GET = () => api((me) => discover(me, 10));
