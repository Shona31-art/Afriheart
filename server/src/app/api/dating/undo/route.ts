import { api } from "@/lib/api";
import { undoPass } from "@/lib/dating";

/** Afriheart+: bring back the last person you passed on. → Card */
export const POST = () => api((me) => undoPass(me));
