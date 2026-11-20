import { body, publicApi } from "@/lib/api";
import { createQuiz } from "@/lib/quiz";

/** Make a quiz (no account needed): { name, answers: { [question]: { a, imp } } } → { slug, key } */
export const POST = async (req: Request) => {
  const b = await body(req);
  return publicApi(() => createQuiz(b.name, b.answers));
};
