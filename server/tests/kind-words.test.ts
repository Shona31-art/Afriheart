import { describe, expect, it } from "vitest";
import { hurtful } from "@/lib/kind-words";

describe("hurtful message check (on the phone)", () => {
  it("catches threats, sexual harassment and insults, including disguised spellings", () => {
    for (const [msg, reason] of [
      ["I will find you", "threat"], ["i know where u live", "threat"], ["just kys", "threat"],
      ["send nudes", "sexual"], ["show me ur boobs", "sexual"], ["sit on my face", "sexual"], ["wanna f*ck?", "sexual"],
      ["you're so ugly", "insult"], ["ur a loser", "insult"], ["stuuupid bitch", "insult"], ["b1tch", "insult"],
      ["f.u.c.k you", "insult"], ["voetsek man", "insult"], ["jou ma se", "insult"], ["nobody wants you", "insult"],
    ] as const) {
      expect(hurtful(msg)?.reason, msg).toBe(reason);
    }
  });

  it("leaves ordinary chat alone", () => {
    for (const msg of [
      "That movie killed me 😂", "I'm a bit fat after Christmas lol", "I hate my ugly couch", "You're stupidly good at this",
      "See you soon!", "Scunthorpe is far", "assume nothing", "Classy place", "Good morning", "I'll find you a table",
      "Let's grab sushi", "You will love this", "Your pic is cute", "Want to go hiking?", "My dog is a loser at fetch",
    ]) {
      expect(hurtful(msg), msg).toBeNull();
    }
  });
});
