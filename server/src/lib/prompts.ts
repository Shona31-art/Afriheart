// Profile prompts: short questions people answer on their profile, which
// others can like or comment on. Pure, safe anywhere.

export const PROMPTS: { id: string; text: string }[] = [
  { id: "sunday", text: "My ideal Sunday" },
  { id: "green_flag", text: "A green flag I look for" },
  { id: "dealbreaker", text: "My non-negotiable" },
  { id: "first_date", text: "The best first date would be" },
  { id: "laugh", text: "I'll make you laugh by" },
  { id: "food", text: "The way to my heart is" },
  { id: "together", text: "We'll get along if" },
  { id: "unpopular", text: "My most unpopular opinion" },
  { id: "known_for", text: "My friends ask me for advice about" },
  { id: "simple_pleasure", text: "My simplest pleasure" },
  { id: "learning", text: "Something I'm learning right now" },
  { id: "travel", text: "A place that changed me" },
  { id: "song", text: "The song I'll always sing along to" },
  { id: "two_truths", text: "Two truths and a lie" },
  { id: "geek", text: "I geek out about" },
  { id: "braai", text: "At a braai you'll find me" },
  { id: "love_language", text: "I feel most loved when" },
  { id: "pet_peeve", text: "My biggest pet peeve" },
  { id: "proud", text: "Something I'm proud of" },
  { id: "looking_for", text: "I'm looking for someone who" },
];

export const MAX_PROMPTS = 3;
export const MAX_ANSWER = 150;
export const MAX_COMMENT = 150;
export const MAX_VOICE_MS = 30_000;

export const promptText = (id: string) => PROMPTS.find((p) => p.id === id)?.text ?? "";
