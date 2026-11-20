// Couple space: one question a day for the two of you. Each of you answers privately; the answers
// open when you've both answered. Written for Afriheart. They come round in order, so a couple
// sees every question before any repeats.

export const COUPLE_QUESTIONS: string[] = [
  "What made you smile today?",
  "What's one thing I did this week that you appreciated?",
  "If we had a free day tomorrow, how would you want to spend it?",
  "What's a song that reminds you of us?",
  "What's something you're looking forward to this month?",
  "What's your favourite memory of us so far?",
  "What's one small thing I could do tomorrow to make your day easier?",
  "Where would you take me for the perfect date?",
  "What's something new you'd like us to try together?",
  "What's a meal you'd love us to cook together?",
  "When did you last feel really proud of me?",
  "What's something you've never told me but want to?",
  "What's your love language this week: words, time, touch, help or gifts?",
  "What's a place you'd love to show me?",
  "What do you think we're best at as a team?",
  "What's one thing on your mind today?",
  "Which of our dates would you happily do again tomorrow?",
  "What's a habit of mine that secretly makes you happy?",
  "If we had our own holiday, what would we call it and how would we celebrate?",
  "What's something you'd like more of between us?",
  "What's a goal you're working on that I can cheer you on with?",
  "What was the best part of your week?",
  "What's a little thing that made you think of me recently?",
  "What would our dream Sunday look like?",
  "Which movie or series should we watch together next?",
  "What's one word for how you feel about us today?",
  "What's something you'd love us to save up for?",
  "What's something I do that always calms you down?",
  "Which city in Africa should we explore together first?",
  "What's a tradition from your family you'd like us to keep?",
  "What's a compliment you'd like to hear more often?",
  "What's the most fun we've ever had together?",
  "What's something you're grateful for today?",
  "If you could relive one day with me, which would it be?",
  "What's a skill you'd love to learn with me?",
  "What's your favourite photo of us, and why?",
  "What's something that's been stressing you that I might not know about?",
  "What should our next adventure be?",
  "What's one thing that always makes you laugh about me?",
  "Where do you see us one year from now?",
  "What's a dish that tastes like home to you?",
  "What do you need from me when you've had a hard day?",
  "What's a date idea for under R100?",
  "What did you first think when we met?",
  "What's one thing you've learned about yourself since we started dating?",
  "If we wrote a song together, what would it be about?",
  "What's your favourite way for us to spend a rainy day?",
  "What's something you hope we never stop doing?",
  "Which friend of yours should I get to know better?",
  "What's the sweetest message I've ever sent you?",
  "What's a challenge we've handled well together?",
  "What's one thing you'd love to do for me this week?",
  "What's your idea of the perfect lazy evening at home?",
  "What's a fear you'd like help with?",
  "What's one thing that makes you feel safe with me?",
  "What's a trip we should take before the year ends?",
  "What's your favourite thing about our conversations?",
  "What's something small that would make our home (or our dates) feel more like us?",
  "Which question should we ask each other tomorrow?",
  "What's one thing you love about us right now?",
];

const DAY = 86400_000;

/** Which question it is today for this chat: every couple starts somewhere different and goes in order. */
export function questionIndex(chatId: string, date: string): number {
  let h = 0;
  for (const ch of chatId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
  return (day + h) % COUPLE_QUESTIONS.length;
}
