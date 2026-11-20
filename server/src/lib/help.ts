// The help centre: answers to what people ask most. Plain words, short, in the app's own terms.

export interface HelpArticle { id: string; category: HelpCategory; q: string; a: string[] }
export type HelpCategory = "sign_in" | "payments" | "safety" | "chats_calls" | "dating" | "account";

export const HELP_CATEGORIES: { id: HelpCategory; label: string }[] = [
  { id: "sign_in", label: "Signing in" },
  { id: "chats_calls", label: "Chats and calls" },
  { id: "dating", label: "Dating" },
  { id: "safety", label: "Safety" },
  { id: "payments", label: "Afriheart+ and payments" },
  { id: "account", label: "Your account and data" },
];

export const HELP: HelpArticle[] = [
  { id: "no-code", category: "sign_in", q: "I didn't get my sign-in code", a: [
    "Codes can take up to a minute. Check you typed your number correctly, with no spaces missing.",
    "You can ask for a new code after 45 seconds, and up to 5 times an hour.",
    "Still nothing? Contact support below with your number, and we'll check it for you.",
  ] },
  { id: "code-wrong", category: "sign_in", q: "It says my code isn't right", a: [
    "Each code works for 10 minutes and 5 tries. Use the newest code if you asked for more than one.",
  ] },
  { id: "new-phone", category: "sign_in", q: "I got a new phone. Where are my messages?", a: [
    "Messages are end-to-end encrypted on each phone, so a new phone can't read messages sent before it was set up. New messages arrive as normal.",
    "If you still have the old phone, keep it signed in until you've saved anything important (Export chat, in the chat's ⋮ menu).",
  ] },
  { id: "cant-sign-in-banned", category: "sign_in", q: "It says my number can't use Afriheart", a: [
    "The team has closed this account, usually after reports about safety. If you think it's a mistake, contact support below and a person will look at it.",
  ] },
  { id: "notifications", category: "chats_calls", q: "I'm not getting message or call notifications", a: [
    "On Android, install the Afriheart app (You → Phone app) and allow notifications when it asks.",
    "Check the chat isn't muted (a crossed-out speaker on the chat list). Open the chat, tap ⋮, then Unmute notifications.",
    "On iPhone, Afriheart works from Safari (Share → Add to Home Screen); calls only ring while it's open.",
  ] },
  { id: "call-quality", category: "chats_calls", q: "Calls keep dropping or the video is poor", a: [
    "Calls go phone to phone over your data or Wi-Fi. Move closer to Wi-Fi, or turn on Data-light mode (You → Data), which uses smaller video.",
    "If calls never connect on mobile data, tell us your network (Vodacom, MTN, Cell C, Telkom, Rain) below.",
  ] },
  { id: "waiting-message", category: "chats_calls", q: "A message says “Waiting for this message”", a: [
    "It was sent before this phone was set up. If the sender is online, their phone re-sends the key and it opens by itself.",
  ] },
  { id: "delete-message", category: "chats_calls", q: "How do I delete, edit or react to a message?", a: [
    "Press and hold the message (or right-click on a computer). You can react, reply, copy, forward, star, edit for 15 minutes, or delete for you or for everyone for about 2½ days.",
  ] },
  { id: "voice-notes", category: "chats_calls", q: "My voice notes won't record", a: [
    "Allow the microphone for Afriheart in your phone's settings, then try again. You can pause, listen first and then send.",
  ] },
  { id: "security-code", category: "chats_calls", q: "What does “the security code changed” mean?", a: [
    "Someone in the chat started using a new phone or browser. Usually that's fine. To be sure, compare the numbers in chat info with them in person or on a call.",
  ] },
  { id: "no-matches", category: "dating", q: "I'm not seeing anyone in Discover", a: [
    "Widen your distance or age range (Discover → your filters), and check your profile isn't paused.",
    "Answering the compatibility questions helps us show you better matches first.",
  ] },
  { id: "verify", category: "dating", q: "How does photo verification work?", a: [
    "Take a live selfie doing the pose we show. A person on the team compares it with your photos, then deletes the selfie. Verified profiles get a badge.",
  ] },
  { id: "unmatch", category: "dating", q: "How do I unmatch someone?", a: [
    "Open the chat, tap their name, then Unmatch. The chat disappears for both of you.",
  ] },
  { id: "vouch", category: "dating", q: "How do friends vouch for me?", a: [
    "You → Friends vouch for you → Ask a friend to vouch. They write a line; you choose whether it shows on your profile.",
  ] },
  { id: "report", category: "safety", q: "How do I report or block someone?", a: [
    "In the chat, tap their name, then Report or block. Or tap ⋮ → More → Report or Block. They won't know who reported them.",
    "The team reviews every report. Underage and safety reports are looked at first.",
  ] },
  { id: "danger", category: "safety", q: "I'm in danger or something happened on a date", a: [
    "If you're in danger now, call 10111 (SAPS) or 112 from a mobile.",
    "Then report them in the app and choose “Something happened on a date”, or contact support below and choose Safety: it goes to the top of the queue.",
  ] },
  { id: "scam", category: "safety", q: "Someone is asking me for money", a: [
    "Don't send money or banking details to someone you've met on Afriheart, however good the story. Report them with “Asking for money or a scam”.",
  ] },
  { id: "first-date", category: "safety", q: "Tips for a safe first date", a: [
    "Meet somewhere public, tell a friend where you'll be (Share date details on the plan card), get yourself there and back, and keep chatting in Afriheart until you're comfortable sharing your number.",
  ] },
  { id: "paid-not-active", category: "payments", q: "I paid but Afriheart+ isn't on", a: [
    "Payfast can take a few minutes to confirm, especially with Instant EFT. Close and reopen the Afriheart+ page.",
    "Still not on after an hour? Contact support below with the date and how you paid. We never need your card or bank details.",
  ] },
  { id: "renew", category: "payments", q: "Will I be charged again automatically?", a: [
    "No. Afriheart+ passes are a single payment with no debit order. When a pass ends, Afriheart+ simply switches off until you buy another.",
  ] },
  { id: "refund", category: "payments", q: "Can I get a refund?", a: [
    "If something went wrong, contact support below and choose Payments. Refunds go back the way you paid, through Payfast.",
  ] },
  { id: "trial", category: "payments", q: "How does the free week work?", a: [
    "Every phone number gets one free week of Afriheart+ when the dating profile is finished. No card is needed and nothing is charged when it ends.",
  ] },
  { id: "delete-account", category: "account", q: "How do I delete my account?", a: [
    "You → Privacy and account → Delete my account. It deletes your profile, photos, answers and everything you sent. It can't be undone.",
  ] },
  { id: "data", category: "account", q: "What can Afriheart see about me?", a: [
    "Not your messages, photos, voice notes or calls: they're end-to-end encrypted. The team can see your profile, reports about you, payments and what you send to support. Read the privacy policy for the full list.",
  ] },
  { id: "data-use", category: "account", q: "Afriheart uses too much data", a: [
    "Turn on Data-light mode (You → Data). Photos and voice notes load only when you tap them, uploads are smaller, and calls use less.",
  ] },
];

export function searchHelp(q: string): HelpArticle[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  return HELP.map((a) => {
    const text = `${a.q} ${a.a.join(" ")}`.toLowerCase();
    const score = words.reduce((n, w) => n + (a.q.toLowerCase().includes(w) ? 3 : 0) + (text.includes(w) ? 1 : 0), 0);
    return { a, score };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 8).map((x) => x.a);
}
