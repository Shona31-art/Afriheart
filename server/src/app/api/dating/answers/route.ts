import { api, body, s } from "@/lib/api";
import { clearAnswer, getProfile, saveAnswer } from "@/lib/dating";

/** My own compatibility answers (nobody else's are ever returned). */
export const GET = () => api(async (me) => (await getProfile(me))?.answers ?? {});

/** { question, a, ok: [], imp: 0-3 } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return api((me) => saveAnswer(me, s(b.question), { a: b.a, ok: b.ok, imp: b.imp }));
};

/** { question }: forget my answer to it. */
export const DELETE = async (req: Request) => {
  const b = await body(req);
  return api((me) => clearAnswer(me, s(b.question)));
};
