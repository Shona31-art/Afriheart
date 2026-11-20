import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getBundleBySlug, getPerson, peopleFor, reliabilityFor } from "@/lib/domain";
import * as M from "@/lib/plan-machine";
import { CATEGORY_LABELS, type Person, type PlanBundle, type Response } from "@/lib/types";
import { formatRelative, formatWhen, toLocalInput } from "@/lib/time";
import { inviteMessage } from "@/lib/companion";
import { requestSignInCode, planAction } from "../../actions";
import { Notice, Section, Skeleton, StatusTag, rand } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CopyLink } from "@/components/copy-link";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBundleBySlug(slug);
  if (!b) return { title: "Plan not found" };
  return {
    title: b.plan.title,
    description: "Vote on the options and say if you're in. No app needed.",
    openGraph: { title: b.plan.title, description: "Vote on the options and say if you're in. No app needed.", siteName: "Afriheart" },
  };
}

export default function PlanPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <PlanContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const STATE_LABEL = { shaping: "Draft", deciding: "Voting", locked: "Locked", done: "Happened", dropped: "Dropped" } as const;

async function PlanContent({ params, searchParams }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const b = await getBundleBySlug(slug);
  if (!b) notFound();
  const viewer = await getPerson(await getSessionPersonId());
  const people = await peopleFor(b);
  const now = new Date();
  const isOrganiser = viewer?.id === b.plan.organiser_id;
  const mine = viewer ? b.commitments.find((c) => c.person_id === viewer.id) : undefined;
  const organiser = people.get(b.plan.organiser_id);
  const locked = M.lockedOption(b);
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? ""}/p/${slug}`;
  const hidden = b.plan.state === "shaping" && !isOrganiser;

  return (
    <>
      <header className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="label">{CATEGORY_LABELS[b.plan.category]}</span>
          <span className={`status ${b.plan.state === "done" || b.plan.state === "locked" ? "status-done" : b.plan.state === "dropped" ? "status-failed" : "status-prepared"}`}>
            {STATE_LABEL[b.plan.state]}
          </span>
        </div>
        <h1 className="display text-3xl leading-tight">{b.plan.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {organiser ? `${organiser.name} is organising` : "Organiser"}
          {b.plan.state === "deciding" && b.plan.decision_deadline && ` · vote closes ${formatRelative(b.plan.decision_deadline, now)}`}
        </p>
      </header>

      <Notice error={error} success={sp.shared ? "Poll is open. Share the link in your WhatsApp group." : undefined} />

      {hidden && (
        <div className="card mb-6">
          <p className="font-semibold">{organiser?.name ?? "The organiser"} is still shaping this plan.</p>
          <p className="text-sm text-muted">You&apos;ll be able to vote once the poll goes out.</p>
        </div>
      )}

      {locked && (b.plan.state === "locked" || b.plan.state === "done") && (
        <LockedCard b={b} slug={slug} viewerId={viewer?.id} now={now} />
      )}

      {b.plan.state === "done" && viewer && <DoneCard b={b} slug={slug} viewerId={viewer.id} isOrganiser={isOrganiser} />}

      {!hidden && (b.plan.state === "shaping" || b.plan.state === "deciding") && (
        <Options b={b} slug={slug} viewer={viewer} isOrganiser={isOrganiser} people={people} />
      )}

      {isOrganiser && <OrganiserPanel b={b} slug={slug} url={url} now={now} />}

      {!viewer && !hidden && (b.plan.state === "deciding" || b.plan.state === "locked") && <GuestJoin slug={slug} />}

      {viewer && !isOrganiser && !hidden && (b.plan.state === "deciding" || b.plan.state === "locked") && (
        <Section title="Are you in?">
          <RespondButtons slug={slug} current={mine?.response} />
        </Section>
      )}

      {!hidden && <PeopleList b={b} people={people} showReliability={!!viewer && M.isMember(b, viewer.id)} />}

      {isOrganiser && b.actions.length > 0 && <CompanionLog b={b} />}

      {viewer && (
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="underline">Back to Now</Link>
        </p>
      )}
    </>
  );
}

function LockedCard({ b, slug, viewerId, now }: { b: PlanBundle; slug: string; viewerId?: string; now: Date }) {
  const o = M.lockedOption(b)!;
  const canCheckIn = viewerId ? M.canCheckIn(b, viewerId, now) : false;
  const checkedIn = viewerId ? b.checkins.some((c) => c.person_id === viewerId) : false;
  const isIn = viewerId ? b.commitments.some((c) => c.person_id === viewerId && c.response === "in") : false;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.what} ${o.where_name} Durban`)}`;
  return (
    <div className="card mb-6 border-accent/50 bg-accent-soft/40">
      <p className="label mb-1">It&apos;s on</p>
      <p className="display text-2xl">{o.what}</p>
      <p className="mt-1">{formatWhen(o.starts_at)} · {o.where_name}{o.est_cost_per_person != null && ` · ${rand(o.est_cost_per_person)} pp`}</p>
      {o.note && <p className="mt-2 text-sm text-muted">{o.note}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {canCheckIn && (
          <form action={planAction}>
            <input type="hidden" name="slug" value={slug} />
            <SubmitButton name="intent" value="checkin" pending="Checking in…">I&apos;m here: check in</SubmitButton>
          </form>
        )}
        {checkedIn && b.plan.state === "locked" && <span className="chip chip-on">You checked in</span>}
        {isIn && b.plan.state === "locked" && <a className="btn btn-ghost btn-sm" href={`/p/${slug}/ics`}>Add to calendar</a>}
        <a className="btn btn-ghost btn-sm" href={maps} target="_blank" rel="noreferrer">Directions</a>
      </div>
      {b.plan.state === "locked" && !canCheckIn && isIn && !checkedIn && (
        <p className="mt-3 text-xs text-muted">Check-in opens two hours before it starts. Two check-ins confirm it happened.</p>
      )}
    </div>
  );
}

function DoneCard({ b, slug, viewerId, isOrganiser }: { b: PlanBundle; slug: string; viewerId: string; isOrganiser: boolean }) {
  const mine = b.checkins.find((c) => c.person_id === viewerId);
  const again = M.againVotes(b);
  return (
    <div className="card mb-6">
      <p className="display text-xl">It happened. {b.checkins.length} people checked in.</p>
      {mine && (
        <form action={planAction} className="mt-3 flex items-center gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="intent" value="again" />
          <span className="text-sm">Do it again?</span>
          <button className={`chip ${mine.again === true ? "chip-on" : ""}`} name="again" value="yes">Yes</button>
          <button className={`chip ${mine.again === false ? "chip-on" : ""}`} name="again" value="no">Not really</button>
        </form>
      )}
      {isOrganiser && !b.plan.circle_id && (
        <form action={planAction} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} />
          <p className="text-sm">{again > 0 ? `${again} ${again === 1 ? "person wants" : "people want"} to do it again. ` : ""}Turn this group into a Circle to repeat it easily.</p>
          <div className="flex gap-2">
            <input className="field" name="name" defaultValue={b.plan.title} maxLength={60} aria-label="Circle name" />
            <SubmitButton name="intent" value="make-circle" pending="Creating…">Make a Circle</SubmitButton>
          </div>
        </form>
      )}
      {b.plan.circle_id && (
        <Link href={`/circles/${b.plan.circle_id}`} className="btn btn-ghost btn-sm mt-3">Open the Circle</Link>
      )}
    </div>
  );
}

function Options({ b, slug, viewer, isOrganiser, people }:
  { b: PlanBundle; slug: string; viewer: Person | null; isOrganiser: boolean; people: Map<string, Person> }) {
  const tally = new Map(M.tally(b).map((t) => [t.option.id, t.votes]));
  const lead = M.winner(b);
  const canVote = !!viewer && b.plan.state === "deciding";
  return (
    <Section title={b.plan.state === "shaping" ? "Options (only you can see these)" : "Vote for every option that works"}>
      {b.plan.ai_reasoning && isOrganiser && b.plan.state === "shaping" && (
        <p className="text-sm text-muted">Companion: {b.plan.ai_reasoning}</p>
      )}
      {b.options.map((o) => {
        const voted = viewer ? b.votes.some((v) => v.option_id === o.id && v.person_id === viewer.id) : false;
        const voters = b.votes.filter((v) => v.option_id === o.id).map((v) => people.get(v.person_id)?.name.split(" ")[0]).filter(Boolean);
        const n = tally.get(o.id) ?? 0;
        return (
          <div key={o.id} className={`card ${voted ? "border-accent" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{o.what}</p>
                <p className="text-sm">{formatWhen(o.starts_at)} · {o.where_name}{o.est_cost_per_person != null && ` · ${rand(o.est_cost_per_person)} pp`}</p>
                {o.note && <p className="mt-1 text-sm text-muted">{o.note}</p>}
                {b.plan.state === "deciding" && (
                  <p className="mt-2 text-xs font-semibold text-accent">
                    {n} vote{n === 1 ? "" : "s"}{voters.length ? `: ${voters.join(", ")}` : ""}{lead?.id === o.id && n > 0 ? " · leading" : ""}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {canVote && (
                  <form action={planAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="option_id" value={o.id} />
                    <button className={`chip ${voted ? "chip-on" : ""}`} name="intent" value="vote" aria-pressed={voted}>
                      {voted ? "✓ Works for me" : "Works for me"}
                    </button>
                  </form>
                )}
                {isOrganiser && b.plan.state === "shaping" && b.options.length > 1 && (
                  <form action={planAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="option_id" value={o.id} />
                    <button className="text-xs text-muted underline" name="intent" value="remove-option">Remove</button>
                  </form>
                )}
                {isOrganiser && b.plan.state === "deciding" && (
                  <form action={planAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="option_id" value={o.id} />
                    <button className="text-xs text-accent underline" name="intent" value="lock">Lock this one</button>
                  </form>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {viewer && M.isMember(b, viewer.id) && b.options.length < 6 && <AddOption slug={slug} />}
    </Section>
  );
}

function AddOption({ slug }: { slug: string }) {
  return (
    <details className="card">
      <summary className="cursor-pointer text-sm font-semibold">+ Suggest another option</summary>
      <form action={planAction} className="mt-3 grid gap-2">
        <input type="hidden" name="slug" value={slug} />
        <input className="field" name="what" required maxLength={120} placeholder="What (e.g. Sushi at Moyo)" aria-label="What" />
        <input className="field" name="where_name" maxLength={120} placeholder="Where" aria-label="Where" />
        <div className="grid grid-cols-2 gap-2">
          <input className="field" type="datetime-local" name="starts_at" required aria-label="When" />
          <input className="field" type="number" name="cost" min={0} placeholder="Cost pp (R)" aria-label="Cost per person in rand" />
        </div>
        <SubmitButton name="intent" value="add-option" className="btn btn-sm justify-self-start">Add option</SubmitButton>
      </form>
    </details>
  );
}

function OrganiserPanel({ b, slug, url, now }: { b: PlanBundle; slug: string; url: string; now: Date }) {
  const state = b.plan.state;
  if (state === "shaping") {
    const def = b.plan.decision_deadline && Date.parse(b.plan.decision_deadline) > now.getTime()
      ? b.plan.decision_deadline : new Date(now.getTime() + 24 * 3600000).toISOString();
    return (
      <Section title="Send it to your group">
        <form action={planAction} className="card flex flex-col gap-3">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col gap-1">
            <span className="text-sm">Voting closes</span>
            <input className="field" type="datetime-local" name="deadline" defaultValue={toLocalInput(def)} required />
          </label>
          <p className="text-xs text-muted">At the deadline I lock the most popular option if at least {b.plan.min_people} people are in. Until then I chase the maybes for you.</p>
          <SubmitButton name="intent" value="send-poll" pending="Opening the poll…">Open the poll</SubmitButton>
        </form>
      </Section>
    );
  }
  if (state === "deciding") {
    const maybes = M.nudgeTargets(b).length;
    const quorum = M.hasQuorum(b);
    return (
      <Section title="Organiser">
        <div className="card flex flex-col gap-3">
          <p className="text-sm">Share the link in your WhatsApp group. People can vote and RSVP without installing anything.</p>
          <CopyLink path={`/p/${slug}`} baseUrl={url.startsWith("http") ? url.slice(0, -`/p/${slug}`.length) : undefined}
            whatsappText={inviteMessage(b.plan.title, "")} />
        </div>
        <div className="card flex flex-col gap-2">
          <p className="text-sm">
            {M.inCount(b)} in · {maybes} maybe · needs {b.plan.min_people} to lock.
            {M.deadlinePassedWithoutQuorum(b, now) && " The deadline has passed without enough people."}
          </p>
          <div className="flex flex-wrap gap-2">
            {maybes > 0 && (
              <form action={planAction}>
                <input type="hidden" name="slug" value={slug} />
                <SubmitButton name="intent" value="nudge" className="btn btn-warm btn-sm" pending="Drafting…">Draft nudges for {maybes} maybe{maybes === 1 ? "" : "s"}</SubmitButton>
              </form>
            )}
            <form action={planAction}>
              <input type="hidden" name="slug" value={slug} />
              <SubmitButton name="intent" value="lock" className="btn btn-sm" pending="Locking…">{quorum ? "Lock the leading option now" : "Try to lock now"}</SubmitButton>
            </form>
            <form action={planAction}>
              <input type="hidden" name="slug" value={slug} />
              <SubmitButton name="intent" value="drop" className="btn btn-ghost btn-sm">Drop the plan</SubmitButton>
            </form>
          </div>
        </div>
      </Section>
    );
  }
  if (state === "locked") {
    return (
      <Section title="Organiser">
        <div className="card flex flex-wrap items-center justify-between gap-2">
          <CopyLink path={`/p/${slug}`} />
          <form action={planAction}>
            <input type="hidden" name="slug" value={slug} />
            <SubmitButton name="intent" value="drop" className="btn btn-ghost btn-sm">Cancel the plan</SubmitButton>
          </form>
        </div>
      </Section>
    );
  }
  return null;
}

function RespondButtons({ slug, current }: { slug: string; current?: Response }) {
  const opts: [Response, string][] = [["in", "I'm in"], ["maybe", "Maybe"], ["out", "Can't make it"]];
  return (
    <form action={planAction} className="flex gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="intent" value="respond" />
      {opts.map(([r, label]) => (
        <button key={r} name="response" value={r} aria-pressed={current === r}
          className={`chip flex-1 justify-center py-2 ${current === r ? "chip-on" : ""}`}>{label}</button>
      ))}
    </form>
  );
}

function GuestJoin({ slug }: { slug: string }) {
  return (
    <Section title="Are you in?">
      <form action={requestSignInCode} className="card flex flex-col gap-3">
        <input type="hidden" name="next" value={`/p/${slug}`} />
        <div className="grid grid-cols-2 gap-2">
          <input className="field" name="name" required maxLength={60} placeholder="Your name" aria-label="Your name" autoComplete="given-name" />
          <input className="field" name="phone" type="tel" required placeholder="Mobile number" aria-label="Mobile number" autoComplete="tel" />
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1" name="respond" value="in">I&apos;m in</button>
          <button className="btn btn-ghost flex-1" name="respond" value="maybe">Maybe</button>
          <button className="btn btn-ghost flex-1" name="respond" value="out">Can&apos;t</button>
        </div>
        <p className="text-xs text-muted">No app or password: we text you a code to confirm it&apos;s your number. It isn&apos;t shown to other guests. After joining you can vote on the options. 18+ only.</p>
      </form>
    </Section>
  );
}

async function PeopleList({ b, people, showReliability }: { b: PlanBundle; people: Map<string, Person>; showReliability: boolean }) {
  const groups: [Response, string][] = [["in", "In"], ["maybe", "Maybe"], ["out", "Out"]];
  const bands = showReliability ? await reliabilityFor(b.commitments.map((c) => c.person_id)) : new Map();
  const checked = new Set(b.checkins.map((c) => c.person_id));
  return (
    <Section title={`Who's coming · ${M.inCount(b)} in`}>
      <div className="card flex flex-col gap-3">
        {groups.map(([r, label]) => {
          const list = M.respondents(b, r);
          if (!list.length) return null;
          return (
            <div key={r}>
              <p className="label mb-1">{label}</p>
              <ul className="flex flex-col gap-1">
                {list.map((c) => {
                  const p = people.get(c.person_id);
                  const band = bands.get(c.person_id);
                  return (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span>
                        {p?.name ?? "Someone"}
                        {c.person_id === b.plan.organiser_id && <span className="text-muted"> · organiser</span>}
                        {checked.has(c.person_id) && <span className="text-accent"> · checked in</span>}
                      </span>
                      {band && band.band !== "New here" && <span className="text-xs text-muted">{band.band}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function CompanionLog({ b }: { b: PlanBundle }) {
  return (
    <Section title="What your companion did">
      <ul className="card flex flex-col gap-3">
        {b.actions.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="flex items-start gap-2">
              <StatusTag status={a.status} />
              <span>{a.summary}</span>
            </div>
            {a.link && a.status === "prepared" && (
              <a href={a.link} target="_blank" rel="noreferrer" className="btn btn-sm btn-warm shrink-0">Send on WhatsApp</a>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Prepared nudges are never sent automatically. You send them, and they show as done once that person answers.</p>
    </Section>
  );
}
