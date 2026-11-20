import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getStore } from "./store";
import { DomainError } from "./domain";
import { compatibility, type Answers, type Importance } from "./compatibility";
import { QUIZ_DAYS, QUIZ_QUESTIONS } from "./quiz-questions";
import type { Quiz } from "./types";

// The public compatibility quiz: no account needed. Someone answers ten
// questions and sends a link; whoever opens it answers too, and both see the
// match %. Like in the app, each person only sees the answers they share, and
// everything is deleted after 30 days. Each person gets a private key (kept on
// their phone) to come back to their results.

const MAX_RESPONSES = 50;
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const newKey = () => randomBytes(24).toString("base64url");
const slugOf = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x");

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  if (name.length < 1) throw new DomainError("Add your first name.");
  return name;
}

/** Every quiz question answered once; importance 0 = any answer is fine, 3 = only the same answer. */
function cleanAnswers(raw: unknown): Answers {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, { a?: unknown; imp?: unknown }>;
  const out: Answers = {};
  for (const q of QUIZ_QUESTIONS) {
    const v = input[q.id];
    const ids = q.options.map((o) => o.id);
    if (!v || typeof v.a !== "string" || !ids.includes(v.a)) throw new DomainError("Answer every question.");
    const imp = [0, 1, 2, 3].includes(Number(v.imp)) ? (Number(v.imp) as Importance) : 2;
    out[q.id] = { a: v.a, ok: imp === 0 ? ids : [v.a], imp };
  }
  return out;
}

async function live(slug: string): Promise<Quiz> {
  const store = getStore();
  const [quiz] = await store.list("quizzes", { slug: String(slug ?? "") });
  if (!quiz) throw new DomainError("This quiz isn't here any more. Quizzes are deleted after 30 days.", 404);
  if (Date.parse(quiz.expires_at) <= Date.now()) {
    for (const r of await store.list("quiz_responses", { quiz_id: quiz.id })) await store.remove("quiz_responses", r.id);
    await store.remove("quizzes", quiz.id);
    throw new DomainError("This quiz isn't here any more. Quizzes are deleted after 30 days.", 404);
  }
  return quiz;
}

export interface QuizResult {
  id: string;
  names: [string, string];
  score: number;
  shared: string[];
  differ: string[];
  created_at: string;
}

function result(quiz: Quiz, r: { id: string; name: string; answers: Answers; created_at: string }): QuizResult {
  const c = compatibility(quiz.answers, r.answers);
  return { id: r.id, names: [quiz.name, r.name], score: c.score ?? 0, shared: c.shared, differ: c.differ, created_at: r.created_at };
}

export async function createQuiz(rawName: unknown, rawAnswers: unknown) {
  const name = cleanName(rawName);
  const answers = cleanAnswers(rawAnswers);
  const key = newKey();
  const now = Date.now();
  const quiz = await getStore().insert("quizzes", {
    id: randomUUID(), slug: slugOf(), name, answers, key_hash: hash(key),
    created_at: new Date(now).toISOString(), expires_at: new Date(now + QUIZ_DAYS * 86400000).toISOString(),
  });
  return { slug: quiz.slug, key, expires_at: quiz.expires_at };
}

/** What someone opening the link sees before answering: whose quiz it is. Never their answers. */
export async function quizInfo(slug: string) {
  const quiz = await live(slug);
  return { name: quiz.name, expires_at: quiz.expires_at };
}

export async function answerQuiz(slug: string, rawName: unknown, rawAnswers: unknown) {
  const quiz = await live(slug);
  const store = getStore();
  if ((await store.list("quiz_responses", { quiz_id: quiz.id })).length >= MAX_RESPONSES) throw new DomainError("This quiz has had a lot of answers already. Make your own instead!");
  const key = newKey();
  const row = await store.insert("quiz_responses", {
    id: randomUUID(), quiz_id: quiz.id, name: cleanName(rawName), answers: cleanAnswers(rawAnswers), key_hash: hash(key), created_at: new Date().toISOString(),
  });
  return { key, result: result(quiz, row) };
}

/** The quiz maker's view: everyone who answered, with their results. */
export async function quizResults(slug: string, key: string) {
  const quiz = await live(slug);
  if (!key || hash(key) !== quiz.key_hash) throw new DomainError("Only the person who made this quiz can see its results.", 403);
  const rows = (await getStore().list("quiz_responses", { quiz_id: quiz.id })).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { name: quiz.name, expires_at: quiz.expires_at, results: rows.map((r) => result(quiz, r)) };
}

/** Someone who answered, coming back to their result. */
export async function myQuizResult(slug: string, id: string, key: string) {
  const quiz = await live(slug);
  const r = await getStore().get("quiz_responses", String(id ?? ""));
  if (!r || r.quiz_id !== quiz.id || !key || hash(key) !== r.key_hash) throw new DomainError("That result isn't available.", 403);
  return result(quiz, r);
}

/** The quiz maker can delete their quiz and every answer to it straight away. */
export async function deleteQuiz(slug: string, key: string) {
  const quiz = await live(slug);
  if (!key || hash(key) !== quiz.key_hash) throw new DomainError("Only the person who made this quiz can delete it.", 403);
  const store = getStore();
  for (const r of await store.list("quiz_responses", { quiz_id: quiz.id })) await store.remove("quiz_responses", r.id);
  await store.remove("quizzes", quiz.id);
}
