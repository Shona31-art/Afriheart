// The public quiz's questions: a mix of quick and deep ones from the app's
// compatibility questions. Pure, safe anywhere.
import { QUESTIONS } from "./compatibility";

export const QUIZ_IDS = ["looking", "kids", "texting", "weekend", "conflict", "cheating", "lovelang", "money", "phone", "worm"] as const;
export const QUIZ_QUESTIONS = QUIZ_IDS.map((id) => QUESTIONS.find((q) => q.id === id)!);
export const QUIZ_DAYS = 30;

/** A quiz answer is your answer and how much it matters. "Very" (3) means only the same answer works for you. */
export interface QuizAnswerInput { a: string; imp: number }
