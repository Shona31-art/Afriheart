// Compatibility questions and scoring. Pure: no storage, safe to use anywhere.
//
// For each question a person gives their own answer, the answers they'd accept
// from a partner, and how much it matters to them. The score asks both ways
// "how well does this person satisfy what I care about?", weighting each
// question by importance, and takes the geometric mean, so a match has to work
// for both people. Shown only once two people have answered enough of the same
// questions to mean something.
//
// Deliberately no questions on religion, politics, health or other special
// personal information (POPIA s26): compatibility shouldn't need them.

export type Pack = "basics" | "deep";
export const PACKS: { id: Pack; title: string; blurb: string }[] = [
  { id: "basics", title: "The basics", blurb: "Quick ones: kids, drinking, weekends, texting." },
  { id: "deep", title: "Going deeper", blurb: "The questions people say to ask before getting serious: cheating, money, family, phones, exes." },
];

export interface Question {
  id: string;
  pack: Pack;
  topic: string; // short label for "You both …" and "You differ on …"
  text: string;
  options: { id: string; label: string; both: string }[]; // both: phrase when two people share it
}

const BASICS: Omit<Question, "pack">[] = [
  { id: "looking", topic: "what you're looking for", text: "What are you looking for right now?", options: [
    { id: "long", label: "Something long-term", both: "want something long-term" },
    { id: "casual", label: "Something casual", both: "want something casual" },
    { id: "friends", label: "Friendship first, then see", both: "like friendship first" },
    { id: "unsure", label: "Not sure yet", both: "are keeping an open mind" },
  ] },
  { id: "kids", topic: "kids", text: "How do you feel about having kids?", options: [
    { id: "want", label: "I want kids someday", both: "want kids someday" },
    { id: "dont", label: "I don't want kids", both: "don't want kids" },
    { id: "have_more", label: "I have kids and want more", both: "have kids and want more" },
    { id: "have_done", label: "I have kids, and I'm done", both: "have kids and are done" },
    { id: "unsure", label: "Not sure", both: "aren't sure about kids yet" },
  ] },
  { id: "smoke", topic: "smoking", text: "Do you smoke or vape?", options: [
    { id: "never", label: "Never", both: "don't smoke" },
    { id: "sometimes", label: "Sometimes", both: "smoke now and then" },
    { id: "often", label: "Regularly", both: "smoke" },
  ] },
  { id: "drink", topic: "drinking", text: "How often do you drink?", options: [
    { id: "never", label: "I don't drink", both: "don't drink" },
    { id: "social", label: "Socially", both: "drink socially" },
    { id: "often", label: "Often", both: "enjoy a drink often" },
  ] },
  { id: "weekend", topic: "weekends", text: "Your ideal weekend?", options: [
    { id: "out", label: "Out with friends", both: "love weekends out with friends" },
    { id: "active", label: "Outdoors and active", both: "spend weekends outdoors" },
    { id: "home", label: "Chilled at home", both: "love a chilled weekend at home" },
    { id: "mix", label: "A bit of everything", both: "like a mix of everything" },
  ] },
  { id: "texting", topic: "texting", text: "How much do you like to text when you're seeing someone?", options: [
    { id: "allday", label: "All day", both: "love texting all day" },
    { id: "few", label: "A few times a day", both: "text a few times a day" },
    { id: "plans", label: "Mostly to make plans", both: "text mostly to make plans" },
  ] },
  { id: "planning", topic: "planning", text: "Planner or spontaneous?", options: [
    { id: "plan", label: "I plan ahead", both: "like to plan ahead" },
    { id: "spont", label: "Spontaneous", both: "are spontaneous" },
    { id: "both", label: "Bit of both", both: "are a bit of both" },
  ] },
  { id: "meet", topic: "meeting up", text: "How soon do you like to meet in person?", options: [
    { id: "soon", label: "Soon, chatting only goes so far", both: "like to meet soon" },
    { id: "while", label: "After chatting for a while", both: "like to chat for a while first" },
    { id: "video", label: "After a video call", both: "like a video call first" },
  ] },
  { id: "bill", topic: "paying on dates", text: "Who pays on a first date?", options: [
    { id: "split", label: "We split it", both: "would split the bill" },
    { id: "asker", label: "Whoever asked", both: "think whoever asked pays" },
    { id: "turns", label: "We take turns", both: "would take turns" },
    { id: "any", label: "I don't mind", both: "don't mind who pays" },
  ] },
  { id: "pets", topic: "pets", text: "Pets?", options: [
    { id: "dogs", label: "Dog person", both: "are dog people" },
    { id: "cats", label: "Cat person", both: "are cat people" },
    { id: "any", label: "Love all animals", both: "love all animals" },
    { id: "none", label: "Rather not", both: "would rather not have pets" },
  ] },
  { id: "conflict", topic: "disagreements", text: "When you disagree with a partner, you…", options: [
    { id: "talk", label: "Talk it out straight away", both: "talk things out straight away" },
    { id: "space", label: "Need some space first", both: "need a little space first" },
    { id: "laugh", label: "Try to laugh it off", both: "try to laugh it off" },
  ] },
  { id: "fitness", topic: "fitness", text: "How active are you?", options: [
    { id: "very", label: "Very: training is my thing", both: "are very active" },
    { id: "some", label: "Sometimes", both: "stay active sometimes" },
    { id: "not", label: "Not really", both: "aren't big on exercise" },
  ] },
];

// The deep set: the topics viral "ask before you get serious" lists keep coming back to.
const DEEP: Omit<Question, "pack">[] = [
  { id: "cheating", topic: "what counts as cheating", text: "What counts as cheating to you?", options: [
    { id: "physical", label: "Only something physical", both: "see cheating as something physical" },
    { id: "flirting", label: "Flirty messages count too", both: "think flirty messages count as cheating" },
    { id: "emotional", label: "A secret emotional bond counts too", both: "think secret emotional bonds count as cheating" },
    { id: "talk", label: "We'd agree our own rules", both: "would agree your own rules" },
  ] },
  { id: "lovelang", topic: "how you show love", text: "What makes you feel most loved?", options: [
    { id: "words", label: "Hearing it: kind words, compliments", both: "feel loved through kind words" },
    { id: "time", label: "Quality time, phones away", both: "feel loved through quality time" },
    { id: "touch", label: "Hugs, holding hands", both: "feel loved through touch" },
    { id: "acts", label: "Help without being asked", both: "feel loved when someone helps out" },
    { id: "gifts", label: "Thoughtful little gifts", both: "love a thoughtful little gift" },
  ] },
  { id: "afterfight", topic: "making up after a fight", text: "After a fight, what helps you most?", options: [
    { id: "sorry", label: "A real apology", both: "need a real apology after a fight" },
    { id: "hug", label: "A hug, then we talk", both: "make up with a hug first" },
    { id: "alone", label: "Time alone to cool off", both: "need time alone to cool off" },
    { id: "fix", label: "Fixing the actual problem", both: "want to fix the actual problem" },
  ] },
  { id: "money", topic: "money", text: "With money, you're…", options: [
    { id: "saver", label: "A saver", both: "are savers" },
    { id: "spender", label: "A spender: life's for living", both: "like to enjoy your money" },
    { id: "balance", label: "Somewhere in between", both: "balance saving and spending" },
  ] },
  { id: "sharemoney", topic: "sharing money", text: "In a serious relationship, money should be…", options: [
    { id: "shared", label: "All shared", both: "would share everything" },
    { id: "bills", label: "Shared for bills, the rest is yours", both: "would share bills and keep the rest" },
    { id: "separate", label: "Kept separate", both: "would keep money separate" },
  ] },
  { id: "marriage", topic: "marriage", text: "Do you want to get married one day?", options: [
    { id: "yes", label: "Yes", both: "want to get married one day" },
    { id: "open", label: "Open to it", both: "are open to marriage" },
    { id: "no", label: "Not for me", both: "aren't set on marriage" },
  ] },
  { id: "movein", topic: "moving in together", text: "When would you move in with a partner?", options: [
    { id: "year", label: "Within a year, if it feels right", both: "would move in when it feels right" },
    { id: "years", label: "After a few years", both: "would take a few years before moving in" },
    { id: "married", label: "Only once we're married or engaged", both: "would wait for engagement or marriage" },
    { id: "own", label: "I like having my own place", both: "like having your own place" },
  ] },
  { id: "family", topic: "family", text: "How involved should family be in your relationship?", options: [
    { id: "close", label: "Very: Sunday lunch every week", both: "are close to family" },
    { id: "some", label: "Close, but we decide for ourselves", both: "are close to family but decide for yourselves" },
    { id: "little", label: "We keep family at a distance", both: "keep family at a distance" },
  ] },
  { id: "phone", topic: "phone privacy", text: "Should partners be able to look through each other's phones?", options: [
    { id: "open", label: "Yes, nothing to hide", both: "are open with your phones" },
    { id: "ask", label: "Only if they ask first", both: "would ask before looking" },
    { id: "private", label: "No, phones are private", both: "think phones are private" },
  ] },
  { id: "exes", topic: "staying friends with exes", text: "Staying friends with an ex is…", options: [
    { id: "fine", label: "Fine", both: "are fine with friendly exes" },
    { id: "depends", label: "Depends on the ex", both: "think it depends on the ex" },
    { id: "no", label: "Not okay", both: "don't stay friends with exes" },
  ] },
  { id: "alone", topic: "time alone", text: "How much time to yourself do you need?", options: [
    { id: "lots", label: "Lots: I recharge alone", both: "need lots of time to yourselves" },
    { id: "some", label: "Some", both: "like some time to yourselves" },
    { id: "little", label: "Hardly any: I'd rather be together", both: "would rather be together" },
  ] },
  { id: "chores", topic: "chores", text: "How should chores be shared?", options: [
    { id: "half", label: "Strictly 50/50", both: "want chores split 50/50" },
    { id: "skills", label: "Whoever's better at it", both: "split chores by who's better at it" },
    { id: "time", label: "Whoever has more time", both: "share chores by who has time" },
  ] },
  { id: "posting", topic: "posting each other online", text: "Posting your partner on social media?", options: [
    { id: "proud", label: "Yes, I'm proud of them", both: "would post each other" },
    { id: "sometimes", label: "Now and then", both: "would post now and then" },
    { id: "private", label: "I keep my relationship private", both: "keep relationships private" },
  ] },
  { id: "move", topic: "moving for a partner", text: "Would you move cities for a partner's job?", options: [
    { id: "yes", label: "Yes, without much thought", both: "would move for a partner" },
    { id: "maybe", label: "Maybe, if it made sense for both of us", both: "would move if it made sense for you both" },
    { id: "no", label: "No, my life is here", both: "are rooted where you are" },
  ] },
  { id: "sleep", topic: "sleep", text: "Early bird or night owl?", options: [
    { id: "early", label: "Early bird", both: "are early birds" },
    { id: "night", label: "Night owl", both: "are night owls" },
    { id: "depends", label: "Depends on the day", both: "change it up" },
  ] },
  { id: "worm", topic: "the worm question", text: "Just for fun: would you still love me if I was a worm?", options: [
    { id: "yes", label: "Obviously. I'd build you a little home", both: "would still love a worm" },
    { id: "depends", label: "Depends what kind of worm", both: "have questions about the worm" },
    { id: "no", label: "No, I'm being honest", both: "are honest about worms" },
  ] },
];

export const QUESTIONS: Question[] = [
  ...BASICS.map((q) => ({ ...q, pack: "basics" as const })),
  ...DEEP.map((q) => ({ ...q, pack: "deep" as const })),
];

export type Importance = 0 | 1 | 2 | 3; // doesn't matter, a little, somewhat, very
export const IMPORTANCE_LABELS = ["Doesn't matter", "A little", "Somewhat", "Very"] as const;
const WEIGHT = [0, 1, 10, 50];
export const MIN_COMMON = 5;

export interface Answer { a: string; ok: string[]; imp: Importance }
export type Answers = Record<string, Answer>;

/** Keeps only valid answers; an empty "would accept" means anything is fine. */
export function cleanAnswer(qid: string, raw: { a?: unknown; ok?: unknown; imp?: unknown }): Answer | null {
  const q = QUESTIONS.find((x) => x.id === qid);
  if (!q) return null;
  const ids = q.options.map((o) => o.id);
  const a = typeof raw.a === "string" && ids.includes(raw.a) ? raw.a : null;
  if (!a) return null;
  const ok = Array.isArray(raw.ok) ? [...new Set(raw.ok.map(String).filter((x) => ids.includes(x)))] : [];
  const imp = [0, 1, 2, 3].includes(Number(raw.imp)) ? (Number(raw.imp) as Importance) : 2;
  return { a, ok: ok.length ? ok : ids, imp };
}

/** How well `them` satisfies what `me` cares about, 0..1 over questions both answered. */
function satisfaction(me: Answers, them: Answers, common: string[]): number | null {
  let possible = 0;
  let earned = 0;
  for (const q of common) {
    const w = WEIGHT[me[q].imp];
    possible += w;
    if (me[q].ok.includes(them[q].a)) earned += w;
  }
  return possible === 0 ? null : earned / possible;
}

export interface Compatibility {
  score: number | null; // 0..100, null when not enough shared answers
  common: number;
  shared: string[]; // "You both …" phrases, most important first
  differ: string[]; // topics where one of you wouldn't accept the other's answer
}

export function compatibility(me: Answers | undefined, them: Answers | undefined): Compatibility {
  const a = me ?? {};
  const b = them ?? {};
  const common = QUESTIONS.map((q) => q.id).filter((id) => a[id] && b[id]);
  const shared: { text: string; w: number }[] = [];
  const differ: string[] = [];
  for (const id of common) {
    const q = QUESTIONS.find((x) => x.id === id)!;
    if (a[id].a === b[id].a) {
      shared.push({ text: q.options.find((o) => o.id === a[id].a)!.both, w: Math.max(a[id].imp, b[id].imp) });
    } else if ((!a[id].ok.includes(b[id].a) && a[id].imp > 0) || (!b[id].ok.includes(a[id].a) && b[id].imp > 0)) {
      differ.push(q.topic);
    }
  }
  shared.sort((x, y) => y.w - x.w);
  if (common.length < MIN_COMMON) return { score: null, common: common.length, shared: shared.map((s) => s.text), differ };
  const s1 = satisfaction(a, b, common);
  const s2 = satisfaction(b, a, common);
  // Nobody cares about any shared question: compatible by default, but say so honestly via a middling score.
  const score = s1 === null && s2 === null ? 50 : Math.round(100 * Math.sqrt((s1 ?? 1) * (s2 ?? 1)));
  return { score, common: common.length, shared: shared.map((s) => s.text), differ };
}

export function answeredCount(answers: Answers | undefined): number {
  return Object.keys(answers ?? {}).filter((id) => QUESTIONS.some((q) => q.id === id)).length;
}
