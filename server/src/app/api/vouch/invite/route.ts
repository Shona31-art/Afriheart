import { api } from "@/lib/api";
import { createVouchInvite } from "@/lib/vouch";

/** A new link to send to a friend so they can vouch for you. */
export const POST = async () => api((me) => createVouchInvite(me));
