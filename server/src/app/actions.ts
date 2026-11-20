"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import * as D from "@/lib/domain";
import { clearSession, getSessionPersonId, setSession } from "@/lib/session";
import { requestCode, verifyCode } from "@/lib/otp";
import { safeNext } from "@/lib/safe-next";
import { runPlanIntent } from "@/lib/plan-intents";
import type { Response } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Only allow redirects to paths inside this app. */
function withError(path: string, err: unknown): never {
  if (err instanceof D.DomainError) {
    const sep = path.includes("?") ? "&" : "?";
    redirect(`${path}${sep}error=${encodeURIComponent(err.message)}`);
  }
  throw err;
}

async function requirePerson(next: string): Promise<string> {
  const id = await getSessionPersonId();
  if (!id || !(await D.getPerson(id))) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return id;
}

async function origin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

/** Step 1 of signing in (or joining a plan from a link): send a code to the number. */
export async function requestSignInCode(form: FormData) {
  const next = safeNext(str(form, "next"));
  const name = str(form, "name").trim().slice(0, 60);
  const respond = str(form, "respond");
  const back = `/signin?${new URLSearchParams({ next, name, ...(respond ? { respond } : {}) })}`;
  let target: string;
  try {
    if (!name) throw new D.DomainError("Please add your name.");
    // A banned number gets no code (and no SMS is paid for).
    const asked = D.normalizePhone(str(form, "phone"));
    if (asked && (await D.findPersonByPhone(asked))?.banned_at) throw new D.DomainError("This number can't use Afriheart. If you think that's a mistake, contact support at /support.");
    const { phone, testCode } = await requestCode(str(form, "phone"), await clientIp());
    target = `/signin?${new URLSearchParams({ step: "code", phone, name, next, ...(respond ? { respond } : {}), ...(testCode ? { test: testCode } : {}) })}`;
  } catch (e) {
    withError(next.startsWith("/p/") && respond ? next : back, e);
  }
  redirect(target);
}

/** Step 2: check the code, then sign in (and answer the plan, when joining from a link). */
export async function verifySignInCode(form: FormData) {
  const next = safeNext(str(form, "next"));
  const name = str(form, "name");
  const respond = str(form, "respond") as Response | "";
  const phoneIn = str(form, "phone");
  try {
    const phone = await verifyCode(phoneIn, str(form, "code"));
    const person = await D.findOrCreatePerson({ name, phone, isGuest: false });
    if (person.banned_at) throw new D.DomainError("This number can't use Afriheart. If you think that's a mistake, contact support at /support.");
    await setSession(person.id, (await headers()).get("user-agent") ?? "");
    const slug = /^\/p\/([\w-]+)$/.exec(next)?.[1];
    if (slug && (respond === "in" || respond === "maybe" || respond === "out")) await D.respond(slug, person.id, respond);
  } catch (e) {
    withError(`/signin?${new URLSearchParams({ step: "code", phone: phoneIn, name, next, ...(respond ? { respond } : {}) })}`, e);
  }
  redirect(next);
}

export async function signOut() {
  await clearSession();
  redirect("/");
}

export async function startPlan(form: FormData) {
  const personId = await requirePerson("/start");
  let slug: string;
  try {
    slug = (await D.createPlanFromSpark(personId, str(form, "spark"))).slug;
  } catch (e) {
    withError("/start", e);
  }
  redirect(`/p/${slug}`);
}

export async function startNextInCircle(form: FormData) {
  const circleId = str(form, "circle_id");
  const personId = await requirePerson(`/circles/${circleId}`);
  let slug: string;
  try {
    slug = (await D.startNextInCircle(circleId, personId)).slug;
  } catch (e) {
    withError(`/circles/${circleId}`, e);
  }
  redirect(`/p/${slug}`);
}

/** Every plan-page button posts here with an `intent`. */
export async function planAction(form: FormData) {
  const slug = str(form, "slug");
  const path = `/p/${slug}`;
  const personId = await requirePerson(path);
  let to = path;
  try {
    const input = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    const next = await runPlanIntent(slug, personId, input, await origin());
    if (next === "shared") to = `${path}?shared=1`;
    else if (next) to = next;
  } catch (e) {
    withError(path, e);
  }
  redirect(to);
}

export async function savePreferences(form: FormData) {
  const personId = await requirePerson("/you");
  const budget = str(form, "budget");
  try {
    await D.updatePreferences(personId, {
      name: str(form, "name").trim().slice(0, 60) || "Me",
      home_area: str(form, "home_area").trim().slice(0, 60) || null,
      budget: budget === "low" || budget === "mid" || budget === "high" ? budget : null,
      availability: form.getAll("availability").map(String).slice(0, 10),
    });
  } catch (e) {
    withError("/you", e);
  }
  redirect("/you?saved=1");
}

export async function addMemory(form: FormData) {
  const personId = await requirePerson("/you");
  try {
    await D.addMemory(personId, str(form, "text"));
  } catch (e) {
    withError("/you", e);
  }
  redirect("/you");
}

export async function deleteMemory(form: FormData) {
  const personId = await requirePerson("/you");
  try {
    await D.deleteMemory(personId, str(form, "id"));
  } catch (e) {
    withError("/you", e);
  }
  redirect("/you");
}
