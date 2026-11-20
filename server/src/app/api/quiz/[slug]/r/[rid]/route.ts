import { publicApi } from "@/lib/api";
import { myQuizResult } from "@/lib/quiz";

/** Someone who answered, back for their result: header x-quiz-key */
export const GET = async (req: Request, ctx: RouteContext<"/api/quiz/[slug]/r/[rid]">) => {
  const { slug, rid } = await ctx.params;
  return publicApi(() => myQuizResult(slug, rid, req.headers.get("x-quiz-key") ?? ""));
};
