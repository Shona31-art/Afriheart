import { body, publicApi } from "@/lib/api";
import { answerQuiz, deleteQuiz, quizInfo } from "@/lib/quiz";

/** Whose quiz this is (never their answers). */
export const GET = async (_req: Request, ctx: RouteContext<"/api/quiz/[slug]">) => {
  const { slug } = await ctx.params;
  return publicApi(() => quizInfo(slug));
};

/** Answer it: { name, answers } → { key, result } */
export const POST = async (req: Request, ctx: RouteContext<"/api/quiz/[slug]">) => {
  const { slug } = await ctx.params;
  const b = await body(req);
  return publicApi(() => answerQuiz(slug, b.name, b.answers));
};

/** The maker deletes it: header x-quiz-key */
export const DELETE = async (req: Request, ctx: RouteContext<"/api/quiz/[slug]">) => {
  const { slug } = await ctx.params;
  return publicApi(() => deleteQuiz(slug, req.headers.get("x-quiz-key") ?? ""));
};
