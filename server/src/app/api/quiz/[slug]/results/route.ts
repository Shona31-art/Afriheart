import { publicApi } from "@/lib/api";
import { quizResults } from "@/lib/quiz";

/** The maker's results: header x-quiz-key */
export const GET = async (req: Request, ctx: RouteContext<"/api/quiz/[slug]/results">) => {
  const { slug } = await ctx.params;
  return publicApi(() => quizResults(slug, req.headers.get("x-quiz-key") ?? ""));
};
