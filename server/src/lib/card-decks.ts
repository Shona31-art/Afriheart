// Talking cards: question decks two people play together, in a chat or during a call.
// All questions are written for Afriheart. Shared by the server (which deals) and the phones (which draw the cards).

export type DeckId = "thoughtful" | "playful" | "flirty" | "future";

export interface Deck {
  id: DeckId;
  name: string;
  blurb: string;
  /** Comes with Afriheart+ (one person in the chat having it unlocks it for everyone there). */
  plus?: boolean;
  /** Card colours: background and text (text contrast is at least 7:1). */
  bg: string;
  ink: string;
  questions: string[];
}

export const CARD_DECKS: Deck[] = [
  {
    id: "thoughtful",
    name: "Thoughtful",
    blurb: "Go a little deeper",
    bg: "#0f4f47",
    ink: "#fdf6ec",
    questions: [
      "What's a small thing I do that makes you feel looked after?",
      "When did you first feel properly at home with me?",
      "What's something you've changed your mind about since we met?",
      "Which of your friends understands you best, and why?",
      "What did your family teach you about love, on purpose or by accident?",
      "What's a worry you carry that you rarely say out loud?",
      "When do you feel most like yourself?",
      "Which memory of us do you replay when you're having a bad day?",
      "What's one thing you'd like us to do more often?",
      "What's a compliment you've never forgotten?",
      "When you're stressed, what do you need from me: space, help, or just company?",
      "What are you proud of that you don't talk about much?",
      "Which version of yourself are you working towards right now?",
      "What's a habit of mine you secretly admire?",
      "What's the bravest thing you've ever done?",
      "How do you like to be comforted when you're sad?",
      "What from your childhood still shapes how you live?",
      "When did you feel really seen by me?",
      "If we disagreed about something big, how would you want us to talk it through?",
      "What's a tradition you'd love us to start?",
      "What does a perfect ordinary Sunday look like for you?",
      "What's one thing you wish more people knew about you?",
      "What's something you forgave that was hard to forgive?",
      "Who showed you what a good relationship looks like?",
      "What's a fear you've outgrown?",
      "What did the last year teach you?",
      "When do you feel closest to me?",
      "Which song sums up where you are in life right now?",
      "What's a promise you've made to yourself?",
      "What could I do this week that would make your week better?",
    ],
  },
  {
    id: "playful",
    name: "Playful",
    blurb: "Laugh together",
    bg: "#f9dde4",
    ink: "#4a1426",
    questions: [
      "If our relationship was a TV show, what would it be called?",
      "What's your most useless talent?",
      "Which fictional character would you trust to plan our date?",
      "What would your walk-out song be?",
      "If you could only eat one dish for a year, what's on the plate?",
      "What's the weirdest thing you believed as a kid?",
      "If you were a kitchen appliance, which one would you be?",
      "What would you name a pet goat?",
      "What's the most chaotic photo in your camera roll right now?",
      "If we entered a talent show together, what's our act?",
      "Which emoji do you overuse?",
      "What's a hill you'd happily die on that doesn't matter at all?",
      "If you swapped lives with a celebrity for a day, who would it be?",
      "What would you do with a completely free, fully paid Saturday?",
      "What's your go-to karaoke song, and how badly do you sing it?",
      "If you opened a restaurant, what would be on the menu?",
      "What food combination do you love that other people find strange?",
      "Which animal would be the rudest if it could talk?",
      "What's the funniest thing that's happened to you in public?",
      "If you could add one subject to every school, what would it be?",
      "What's your villain origin story, in one sentence?",
      "What would this weekend's theme song be?",
      "What's a trend you're glad is gone?",
      "Honestly, which of us would last longer in a zombie film?",
      "If you were a sauce, which sauce would you be?",
      "What's the most random thing you've searched online this month?",
      "What would your autobiography be called?",
      "If you could teleport anywhere for lunch today, where would you go?",
      "Which outfit of yours would you love to delete from history?",
      "Name three things you'd take to a desert island. No phones allowed.",
    ],
  },
  {
    id: "flirty",
    name: "Flirty",
    blurb: "Turn up the romance",
    plus: true,
    bg: "#6e1a30",
    ink: "#fdeef2",
    questions: [
      "What was the first thing you noticed about me?",
      "When did you first think, “oh, I like this one”?",
      "Which outfit of mine would you like to see more often?",
      "Describe your perfect date night in three words.",
      "What's something I do that you find very attractive?",
      "What's a compliment you've wanted to give me but haven't yet?",
      "What's the best date we've had so far, and what made it?",
      "What song would you put on for a slow dance in the kitchen?",
      "What's your favourite way to be greeted after a long day?",
      "If you planned a surprise for me, what would it be?",
      "What little thing instantly puts you in a romantic mood?",
      "A love note, a long hug or a playlist: which wins?",
      "What would you like us to try together for the first time?",
      "What's your favourite thing about my voice?",
      "Breakfast in bed or a late-night drive?",
      "What's the most romantic thing anyone's ever done for you?",
      "What would you whisper to me if nobody else could hear?",
      "Which scent reminds you of me?",
      "If tonight was a movie scene, how would it start?",
      "What do you wish I'd text you more often?",
      "Holding hands, forehead kisses or back hugs?",
      "What was going through your head on our first date?",
      "What date idea have you been too shy to suggest?",
      "What do you think our chemistry is made of?",
      "What about me would you never get bored of?",
      "Where would you take me for a weekend away?",
      "What's the sweetest thing I've ever said to you?",
      "Dancing like nobody's watching or dinner by candlelight?",
      "Name three words for how I make you feel.",
      "What's your favourite photo of us, and why?",
    ],
  },
  {
    id: "future",
    name: "Future us",
    blurb: "Dream a little",
    plus: true,
    bg: "#f4dc9b",
    ink: "#3a2a06",
    questions: [
      "Where do you picture us living in five years?",
      "What's a trip we have to take together one day?",
      "What skill would you love us to learn together?",
      "How do you want to celebrate our anniversaries?",
      "What do you want to have achieved by this time next year?",
      "City, small town, or somewhere by the sea?",
      "What would our perfect home have that most homes don't?",
      "How do you want us to handle money as a team?",
      "What does a good work-life balance look like for you?",
      "What's a dream you've never said out loud?",
      "Which family traditions do you want to keep, and which would you drop?",
      "Holidays: with family, with friends, or just us?",
      "What's on your bucket list that I don't know about yet?",
      "What kind of old couple do you think we'd be?",
      "If we had a year off, what would we do with it?",
      "What's one goal you'd like my help with?",
      "Pets: yes, no, or how many?",
      "How do you want us to look after our health together?",
      "Which cause or community would you like us to give time to?",
      "What would make you feel secure in a long relationship?",
      "What do you hope never changes between us?",
      "What big risk would you take if you knew I had your back?",
      "What does an ordinary weekday look like for us in ten years?",
      "What do you want people to say about us as a couple?",
      "Which city in the world would you move to for a year?",
      "How should our home feel when friends visit?",
      "How should we celebrate big wins together?",
      "What's one thing we should save up for?",
      "What's a habit you'd like us to build as a couple?",
      "Where should we be when we toast our first big milestone?",
    ],
  },
];

export const deckById = (id: string): Deck | undefined => CARD_DECKS.find((d) => d.id === id);

/** The deck's cards in a shuffled order that's the same on every phone for the same seed. */
export function dealOrder(seed: number, n: number): number[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
