import { api } from "@/lib/api";
import { listMatches } from "@/lib/dating";

export const GET = () => api((me) => listMatches(me));
