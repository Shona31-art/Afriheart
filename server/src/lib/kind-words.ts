// A check for hurtful messages that runs on the phone, so end-to-end
// encryption stays intact: nothing is sent anywhere to be checked.
//
// Like Tinder's "Does this bother you?" and "Are you sure?": received messages
// that look hurtful are blurred until tapped, and you're asked once before
// sending one. It's a word-and-phrase check (threats, sexual harassment,
// insults, including some South African ones), tuned to avoid flagging
// ordinary chat. A small on-device model could replace it later.

export type Hurt = { reason: "threat" | "sexual" | "insult" } | null;

const END = "(?=\\s*(and\\b|[.!?]|$))";

const THREATS = [
  /\bi('?ll| will| am going to|'?m gonna| gonna)\s+(kill|hurt|beat|rape)\s+(you|u)\b/,
  new RegExp(`\\bi('?ll| will| am going to|'?m gonna| gonna)\\s+(find|get)\\s+(you|u)${END}`),
  /\bi know where (you|u) (live|work|stay)\b/,
  /\bwatch (your|ur) back\b/,
  /\b(you|u)('?ll| will) regret (this|it|that)\b/,
  /\b(kill|hang|shoot) (yourself|urself|ur self)\b/,
  /\bkys\b/,
  /\bgo (and )?die\b/,
];

const SEXUAL = [
  /\bsend (me )?(nudes?|pics of (your|ur) body|a pic of (your|ur) (body|boobs|tits|ass))\b/,
  /\bnudes?\b/,
  /\bdick ?pic\b/,
  /\bshow me (your|ur) (boobs|tits|ass|body|pussy)\b/,
  /\b(suck|lick) my\b/,
  /\bsit on my (face|lap|dick)\b/,
  /\bwanna (f[u*]ck|smash|bang)\b/,
  /\b(f[u*]ck|smash|bang) (you|u) (so )?hard\b/,
  /\bhow much for (a )?(night|hour)\b/,
];

const INSULTS = [
  /\b(you('re| are)|ur|u r|youre)\s+(so\s+|really\s+|such an?\s+|an?\s+)?(ugly|fat|disgusting|pathetic|worthless|stupid|an idiot|a loser|loser|trash|a joke|nothing)\b/,
  /\b(stupid|dumb|ugly|fat|f[u*]cking) (bitch|cow|slut|whore|hoe|pig|loser)\b/,
  /\b(bitch|slut|whore|skank|retard)\b/,
  /\bf[u*]ck (you|u|off)\b/,
  /\b(screw|stuff) (you|u)\b/,
  /\bnobody (wants|likes|will love) (you|u)\b/,
  /\b(poes|doos|voetsek|jou ma se)\b/,
];

/** Lower-case and undo common disguises: l33t letters and dots between letters ("b.i.t.c.h"). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[!|]/g, "i").replace(/0/g, "o").replace(/\$/g, "s").replace(/7/g, "t")
    .replace(/1(?=[a-z])|(?<=[a-z])1/g, "i")
    .replace(/\b(\w)[.\-_](?=\w\b)/g, "$1")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stretched letters, two ways: "stuuupid" → "stupid" (single) and "killll" → "kill" (double). */
const forms = (t: string) => [t.replace(/(\w)\1{2,}/g, "$1$1"), t.replace(/(\w)\1+/g, "$1")];

export function hurtful(text: string | null | undefined): Hurt {
  if (!text) return null;
  const ts = forms(normalize(text));
  const hit = (list: RegExp[]) => ts.some((t) => list.some((re) => re.test(t)));
  if (hit(THREATS)) return { reason: "threat" };
  if (hit(SEXUAL)) return { reason: "sexual" };
  if (hit(INSULTS)) return { reason: "insult" };
  return null;
}

export const HURT_LABEL: Record<NonNullable<Hurt>["reason"], string> = {
  threat: "This message may be threatening.",
  sexual: "This message may be sexual or unwanted.",
  insult: "This message may be hurtful.",
};
