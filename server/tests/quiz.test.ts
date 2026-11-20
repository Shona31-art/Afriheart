import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "quiz-")), "db.json");
const { getStore } = await import("@/lib/store");
const quiz = await import("@/lib/quiz");
const { QUIZ_QUESTIONS } = await import("@/lib/quiz-questions");

const answers = (pick: (i: number) => number, imp = 2) =>
  Object.fromEntries(QUIZ_QUESTIONS.map((q, i) => [q.id, { a: q.options[pick(i) % q.options.length].id, imp }]));

describe("public compatibility quiz", () => {
  it("needs a name and every question answered", async () => {
    await expect(quiz.createQuiz("", answers(() => 0))).rejects.toThrow(/first name/);
    const missing = answers(() => 0);
    delete missing.kids;
    await expect(quiz.createQuiz("Ayesha", missing)).rejects.toThrow(/every question/);
    await expect(quiz.createQuiz("Ayesha", { ...answers(() => 0), kids: { a: "nonsense", imp: 2 } })).rejects.toThrow(/every question/);
  });

  it("matches two people and shows only what they share", async () => {
    const made = await quiz.createQuiz("Ayesha", answers(() => 0, 3));
    const info = await quiz.quizInfo(made.slug);
    expect(info).toEqual({ name: "Ayesha", expires_at: made.expires_at }); // never her answers
    const same = await quiz.answerQuiz(made.slug, "Sipho", answers(() => 0));
    expect(same.result.score).toBe(100);
    expect(same.result.names).toEqual(["Ayesha", "Sipho"]);
    expect(same.result.shared.length).toBeGreaterThan(3);
    const different = await quiz.answerQuiz(made.slug, "Kyle", answers((i) => i + 1));
    expect(different.result.score).toBeLessThan(50);
    expect(different.result.differ.length).toBeGreaterThan(3);
    expect(JSON.stringify(different)).not.toMatch(/"imp"|"ok"/); // no raw answers in a result
  });

  it("lets only the maker see everyone's results, and each person their own", async () => {
    const made = await quiz.createQuiz("Lebo", answers(() => 1));
    const r = await quiz.answerQuiz(made.slug, "Thabo", answers(() => 1));
    await expect(quiz.quizResults(made.slug, "wrong")).rejects.toThrow(/Only the person who made/);
    await expect(quiz.quizResults(made.slug, r.key)).rejects.toThrow(/Only the person who made/);
    expect((await quiz.quizResults(made.slug, made.key)).results.map((x) => x.names[1])).toEqual(["Thabo"]);
    expect((await quiz.myQuizResult(made.slug, r.result.id, r.key)).score).toBe(100);
    await expect(quiz.myQuizResult(made.slug, r.result.id, made.key)).rejects.toThrow(/isn't available/);
  });

  it("is deleted after 30 days, or straight away by its maker", async () => {
    const old = await quiz.createQuiz("Old", answers(() => 0));
    const [row] = await getStore().list("quizzes", { slug: old.slug });
    await quiz.answerQuiz(old.slug, "Friend", answers(() => 0));
    await getStore().update("quizzes", row.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    await expect(quiz.quizInfo(old.slug)).rejects.toThrow(/deleted after 30 days/);
    expect(await getStore().list("quizzes", { slug: old.slug })).toEqual([]);
    expect(await getStore().list("quiz_responses", { quiz_id: row.id })).toEqual([]);

    const mine = await quiz.createQuiz("Mine", answers(() => 0));
    await expect(quiz.deleteQuiz(mine.slug, "nope")).rejects.toThrow(/Only the person who made/);
    await quiz.deleteQuiz(mine.slug, mine.key);
    await expect(quiz.quizInfo(mine.slug)).rejects.toThrow(/isn't here/);
  });
});
