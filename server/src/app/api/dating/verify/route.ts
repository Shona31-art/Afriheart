import { api } from "@/lib/api";
import { startVerification, verifyStatus } from "@/lib/team";

/** My verification: none, started (with the pose to do), pending, approved or rejected (with why). */
export const GET = () => api((me) => verifyStatus(me));

/** Start (or restart) verification: returns a fresh pose to do in the selfie. */
export const POST = () => api((me) => startVerification(me));
