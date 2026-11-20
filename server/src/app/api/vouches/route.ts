import { api } from "@/lib/api";
import { vouchesAbout } from "@/lib/vouch";

/** Vouches friends wrote about you (waiting, showing and hidden). */
export const GET = async () => api((me) => vouchesAbout(me));
