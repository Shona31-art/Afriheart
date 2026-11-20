import { api } from "@/lib/api";
import { getSession, revokeSessions } from "@/lib/session";

/** Sign out everywhere else: ends every other session of mine on the server. */
export const DELETE = () => api(async (me) => {
  const current = await getSession();
  await revokeSessions(me, { except: current?.id });
  return { ok: true };
});
