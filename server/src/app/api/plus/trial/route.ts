import { api } from "@/lib/api";
import { DomainError } from "@/lib/domain";
import { startTrial, trialState } from "@/lib/plus";

export const GET = () => api((me) => trialState(me));

/** Starts the free week (once per phone number). */
export const POST = () => api(async (me) => {
  if (!(await startTrial(me))) throw new DomainError("This number has already had its free week.");
  return trialState(me);
});
