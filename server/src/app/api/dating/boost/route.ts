import { api } from "@/lib/api";
import { boostState, startBoost } from "@/lib/dating";

/** → { plus, active_until, next_at } */
export const GET = () => api((me) => boostState(me));
/** Afriheart+: start a 30-minute boost (once a day). */
export const POST = () => api((me) => startBoost(me));
