import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionPersonId } from "@/lib/session";
import { getPerson, listMemories, reliabilityFor } from "@/lib/domain";
import { SLOT_HOURS } from "@/lib/guide";
import { formatPhone } from "@/lib/client";
import { addMemory, deleteMemory, savePreferences } from "../actions";
import { Notice, Section, Skeleton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Avatar } from "@/components/avatar";
import { LinkedDevices, SignOutButton } from "@/components/linked-devices";
import { DeleteAccount } from "@/components/delete-account";
import { isTeam, verifyStatus } from "@/lib/team";
import { plusUntil, trialState } from "@/lib/plus";
import { unreadSupport } from "@/lib/support";
import { staffRole } from "@/lib/admin";
import { VouchManager } from "@/components/vouch-manager";
import { DataLightSettings } from "@/components/data-light-settings";
import { PrivacySettings } from "@/components/privacy-settings";

export const metadata = { title: "You" };

export default function YouPage({ searchParams }: PageProps<"/you">) {
  return (
    <main className="page">
      <Suspense fallback={<Skeleton />}>
        <YouContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const chip = "chip min-h-11 cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent";

async function YouContent({ searchParams }: { searchParams: PageProps<"/you">["searchParams"] }) {
  const person = await getPerson(await getSessionPersonId());
  if (!person) redirect("/signin?next=/you");
  const sp = await searchParams;
  const memories = await listMemories(person.id);
  const rel = (await reliabilityFor([person.id])).get(person.id);
  const [verify, team, plus, trial, supportUnread, staff] = await Promise.all([verifyStatus(person.id), isTeam(person.id), plusUntil(person.id), trialState(person.id), unreadSupport(person.id), staffRole(person.id)]);
  const verifyText = { none: "Verify with a selfie to get a badge and meet verified people.", started: "Verify with a selfie to get a badge and meet verified people.", pending: "Your selfie is being checked by the team.", approved: "You're photo verified.", rejected: "Your last selfie wasn't approved. You can try again." }[verify.state];
  return (
    <>
      <header className="mb-6 flex items-center gap-4">
        <Avatar name={person.name} seed={person.id} size={64} />
        <div className="min-w-0">
          <h1 className="display truncate text-3xl">{person.name}</h1>
          <p className="text-sm text-muted">{formatPhone(person.phone)} · {rel?.band ?? "New here"}</p>
        </div>
      </header>

      <Notice error={typeof sp.error === "string" ? sp.error : undefined} success={sp.saved ? "Saved." : undefined} />

      {team && (
        <Section title="Team">
          <div className="card flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">Check selfies and review reports.</p>
            <a href="/team" className="btn btn-sm shrink-0">Open team queue</a>
          </div>
        </Section>
      )}

      <Section title="Afriheart+">
        <a href="/plus" className="card flex items-center justify-between gap-3 text-sm" data-plus-card>
          <span>
            <span className="block font-semibold">{trial.trial_until ? (trial.founding ? "Founding member: Afriheart+ is on" : "Your free week of Afriheart+") : plus ? "You have Afriheart+" : trial.offer_until ? "Welcome offer: first month R29" : trial.can_start ? (trial.founding ? `Founding offer: ${trial.trial_days === 30 ? "first month" : trial.trial_days % 30 === 0 ? `${trial.trial_days / 30} months` : `${trial.trial_days} days`} of Afriheart+ free` : "Try Afriheart+ free for 7 days") : "See who likes you"}</span>
            <span className="block text-muted">{plus ? `${trial.trial_until ? "Free until" : "Until"} ${new Date(plus).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}. Add more time any time.` : trial.offer_until ? "Instead of R59, for the next 48 hours only." : trial.can_start ? (trial.founding && trial.founding_left !== null ? `Only ${trial.founding_left.toLocaleString("en-ZA")} founding spots left. No card needed.` : "Boost, undo and see who likes you. No card needed, nothing charged after.") : "From R19 a week. Pay once with card, EFT, Capitec Pay or SnapScan. No debit order."}</span>
          </span>
          <span className="btn btn-sm shrink-0">{plus ? "Manage" : trial.can_start ? "Try free" : "Get Afriheart+"}</span>
        </a>
      </Section>

      <Section title="Dating">
        <div className="card flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">{verifyText}</p>
          {verify.state !== "approved" && verify.state !== "pending" && <a href="/dating/verify" className="btn btn-sm shrink-0">Get verified</a>}
        </div>
        <div className="card flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">Your photos, date idea and who you&apos;d like to meet.</p>
          <a href="/dating/profile" className="btn btn-sm shrink-0">Edit dating profile</a>
        </div>
        <div className="card flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">Compatibility questions: see your match % with people.</p>
          <a href="/dating/questions" className="btn btn-ghost btn-sm shrink-0">Answer questions</a>
        </div>
        <div className="card flex items-center justify-between gap-3 text-sm">
          <p className="text-muted">Going deeper: cheating, money, family, phones, exes. The talks people say to have before getting serious.</p>
          <a href="/dating/questions?pack=deep" className="btn btn-ghost btn-sm shrink-0">Go deeper</a>
        </div>
      </Section>

      <Section title="Friends vouch for you">
        <VouchManager firstName={person.name.split(" ")[0]} />
      </Section>

      <Section title="Date deals and events">
        <a href="/deals" className="card flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Date-night specials, singles nights and group braais near you.</span>
          <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">Coming soon</span>
        </a>
      </Section>

      <Section title="Chats and privacy">
        <PrivacySettings initial={{ hide_last_seen: !!person.hide_last_seen, read_receipts_off: !!person.read_receipts_off }} />
      </Section>

      <Section title="Data">
        <DataLightSettings />
      </Section>

      <Section title="Profile and plans">
        <form action={savePreferences} className="card flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Name</span>
            <input className="field" name="name" defaultValue={person.name} maxLength={60} autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Home area</span>
            <span className="text-xs text-muted">Helps Afriheart suggest places near you.</span>
            <input className="field" name="home_area" defaultValue={person.home_area ?? ""} placeholder="e.g. Morningside" maxLength={60} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">Usual budget per outing</legend>
            <div className="flex flex-wrap gap-2">
              {[["low", "Under R120"], ["mid", "R120–R250"], ["high", "Flexible"]].map(([v, l]) => (
                <label key={v} className={chip}>
                  <input type="radio" name="budget" value={v} defaultChecked={person.budget === v} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">When you&apos;re usually free</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SLOT_HOURS).map(([k, s]) => (
                <label key={k} className={chip}>
                  <input type="checkbox" name="availability" value={k} defaultChecked={person.availability.includes(k)} className="sr-only" />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton className="btn self-start" pending="Saving…">Save changes</SubmitButton>
        </form>
      </Section>

      <Section title="Linked devices">
        <LinkedDevices personId={person.id} />
      </Section>

      <Section title="What Afriheart remembers">
        <div className="card flex flex-col gap-3">
          <p className="text-sm text-muted">Used only to suggest better plans. Afriheart learns from plans that actually happened and from what you add here. It never reads your chats.</p>
          {memories.length === 0 && <p className="text-sm">Nothing yet.</p>}
          <ul className="flex flex-col gap-2">
            {memories.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p>{m.text}</p>
                  <p className="text-xs text-muted">{m.kind === "learned" ? `Learned from: ${m.evidence}` : m.evidence}</p>
                </div>
                <form action={deleteMemory}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="min-h-11 px-2 text-sm font-semibold text-accent underline" aria-label={`Forget: ${m.text}`}>Forget</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addMemory} className="flex gap-2">
            <label className="sr-only" htmlFor="memory-text">Something for Afriheart to remember</label>
            <input id="memory-text" className="field" name="text" maxLength={200} placeholder="e.g. I'm vegetarian" />
            <SubmitButton className="btn btn-sm">Add</SubmitButton>
          </form>
        </div>
      </Section>

      <Section title="Follow-through">
        <div className="card text-sm">
          <p className="font-semibold">{rel?.band ?? "New here"}</p>
          <p className="text-muted">
            Based on {rel?.samples ?? 0} completed plan{rel?.samples === 1 ? "" : "s"}. Friends see only this label, never a score, and only on plans you share.
          </p>
        </div>
      </Section>

      {process.env.NEXT_PUBLIC_ANDROID_APK_URL && (
        <Section title="Phone app">
          <div className="card text-sm">
            <p className="mb-1 font-semibold">Afriheart for Android</p>
            <p className="mb-3 text-muted">Calls ring like a normal phone call, even when the app is closed. On iPhone, tap Share, then Add to Home Screen.</p>
            <a className="btn btn-sm" href={process.env.NEXT_PUBLIC_ANDROID_APK_URL}>Download the Android app</a>
          </div>
        </Section>
      )}

      <Section title="Help and support">
        <Link href="/support" className="card flex items-center justify-between gap-3 text-sm" data-support-card>
          <span>
            <span className="block font-semibold">Get help, or tell us about a problem</span>
            <span className="block text-muted">{supportUnread ? `${supportUnread} new ${supportUnread === 1 ? "reply" : "replies"} from the team` : "Answers to common questions, and a person to help if something's wrong."}</span>
          </span>
          <span className="btn btn-sm shrink-0">{supportUnread ? "Read" : "Help"}</span>
        </Link>
        {staff && <a href="/admin" className="card text-sm font-semibold text-accent underline" data-admin-link>Open the admin area</a>}
      </Section>

      <Section title="Privacy and account">
        <div className="flex flex-col gap-2">
        <div className="card flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a href="/privacy" className="font-semibold text-accent underline">Privacy policy</a>
          <a href="/terms" className="font-semibold text-accent underline">Terms</a>
          <a href="/dating/safety" className="font-semibold text-accent underline">Dating safety</a>
        </div>
        <DeleteAccount personId={person.id} />
        </div>
      </Section>

      <SignOutButton personId={person.id} />
    </>
  );
}
