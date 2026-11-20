import { api, body, publicApi } from "@/lib/api";
import { getSessionPersonId } from "@/lib/session";
import { createTicket, myTickets } from "@/lib/support";

export const GET = () => api((me) => myTickets(me));

/** A new support request. Works signed out too (for sign-in problems): then name and phone are needed. */
export const POST = async (req: Request) => {
  const b = await body(req);
  const me = await getSessionPersonId();
  return publicApi(() => createTicket(me, b));
};
