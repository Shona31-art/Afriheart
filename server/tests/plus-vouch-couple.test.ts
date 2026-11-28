import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.LOCAL_DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), "pvc-")), "db.json");
process.env.ALLOW_TEST_PAYMENTS = "yes-insecure";
const { findOrCreatePerson } = await import("@/lib/domain");
const chat = await import("@/lib/chat");
const { getStore } = await import("@/lib/store");
const payfast = await import("@/lib/payfast");
const plus = await import("@/lib/plus");
const { playCards } = await import("@/lib/cards");
const vouch = await import("@/lib/vouch");
const couple = await import("@/lib/couple");
const deals = await import("@/lib/deals");

let n = 0;
const person = async (name: string) => (await findOrCreatePerson({ name, phone: `2782${String(5550000 + ++n).padStart(7, "0")}`, isGuest: false })).id;
const phoneOf = async (id: string) => `0${(await getStore().get("people", id))!.phone.slice(2)}`;

describe("Payfast", () => {
  const fields = {
    merchant_id: "10000100", merchant_key: "46f0cd694581a",
    return_url: "https://afriheart.example.com/plus?paid=abc", cancel_url: "https://afriheart.example.com/plus?cancelled=1",
    notify_url: "https://afriheart.example.com/api/plus/payfast", name_first: "Thabo", m_payment_id: "abc-123", amount: "59.00",
    item_name: "Afriheart+ 1 month (it's *great* ~ ok!)",
  };
  it("signs the checkout exactly like Payfast's own PHP code (urlencode, field order, passphrase)", () => {
    // Reference computed with PHP's urlencode() and md5(), as in Payfast's documentation.
    expect(payfast.checkoutSignature(fields, "jt7NOE43FZPn")).toBe("6b56ef82fb24ff7c395a9828f4db490a");
    // Blank fields are left out, and the order doesn't depend on how the object was built.
    const shuffled = Object.fromEntries(Object.entries({ ...fields, name_last: "  " }).reverse());
    expect(payfast.checkoutSignature(shuffled, "jt7NOE43FZPn")).toBe("6b56ef82fb24ff7c395a9828f4db490a");
  });

  it("accepts a correctly signed notification and rejects a changed one", () => {
    const pairs: [string, string][] = [["m_payment_id", "abc-123"], ["pf_payment_id", "1089250"], ["payment_status", "COMPLETE"], ["item_name", "Afriheart+ 1 month"], ["amount_gross", "59.00"], ["merchant_id", "10000100"]];
    const base = pairs.map(([k, v]) => `${k}=${payfast.phpUrlencode(v)}`).join("&");
    const sig = createHash("md5").update(`${base}&passphrase=secret`).digest("hex");
    const body = [...pairs, ["signature", sig]].map(([k, v]) => `${k}=${payfast.phpUrlencode(v)}`).join("&");
    const parsed = payfast.parseItn(body);
    expect(parsed.data.item_name).toBe("Afriheart+ 1 month");
    expect(payfast.validItnSignature(parsed.pairs, "secret")).toBe(true);
    expect(payfast.validItnSignature(parsed.pairs, "wrong")).toBe(false);
    const tampered = payfast.parseItn(body.replace("amount_gross=59.00", "amount_gross=1.00"));
    expect(payfast.validItnSignature(tampered.pairs, "secret")).toBe(false);
  });

  it("ignores notifications that aren't from Payfast", async () => {
    process.env.PAYFAST_MERCHANT_ID = "10000100";
    process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
    try {
      expect(await plus.handlePayfastItn("m_payment_id=x&signature=nope", "1.2.3.4")).toBe("bad signature");
    } finally {
      delete process.env.PAYFAST_MERCHANT_ID;
      delete process.env.PAYFAST_MERCHANT_KEY;
    }
  });
});

describe("Afriheart+", () => {
  it("adds a pass's days once, stacks passes, and unlocks Flirty for both people in the chat", async () => {
    const a = await person("Ayanda Zulu"), b = await person("Lerato Mokoena");
    const room = (await chat.openDirectChat(a, await phoneOf(b))).id;
    await expect(playCards(room, b, "deck", { deck: "flirty" })).rejects.toThrow("comes with an Afriheart membership");
    expect(await plus.hasPlus(a)).toBe(false);

    const c1 = await plus.startCheckout(a, "week", "https://x.test");
    expect(c1.action).toBe("/plus/test-checkout");
    expect((await plus.paymentFor(a, c1.id)).status).toBe("pending");
    await expect(plus.paymentFor(b, c1.id)).rejects.toThrow(); // only your own payments
    await plus.completePayment(c1.id, "ref", "Card");
    await plus.completePayment(c1.id, "ref", "Card"); // a repeated notification adds nothing
    const week = Date.parse((await plus.plusUntil(a))!);
    expect(Math.round((week - Date.now()) / 86400_000)).toBe(7);

    const c2 = await plus.startCheckout(a, "month", "https://x.test");
    await plus.testCheckout(a, c2.id, "pay");
    expect(Math.round((Date.parse((await plus.plusUntil(a))!) - Date.now()) / 86400_000)).toBe(37);

    const game = await playCards(room, b, "deck", { deck: "flirty" }); // b doesn't pay; a does
    expect(game).toMatchObject({ deck: "flirty", plus: true });
  });

  it("refuses unknown passes and cancels cleanly", async () => {
    const a = await person("Kagiso Molefe");
    await expect(plus.startCheckout(a, "forever", "https://x.test")).rejects.toThrow("Choose a pass.");
    const c = await plus.startCheckout(a, "quarter", "https://x.test");
    expect((await getStore().get("payments", c.id))!.amount_cents).toBe(14900);
    await plus.testCheckout(a, c.id, "cancel");
    expect((await plus.paymentFor(a, c.id)).status).toBe("cancelled");
    expect(await plus.hasPlus(a)).toBe(false);
  });
});

describe("Free trial and welcome offer", () => {
  it("gives one free week per phone number, then a 48-hour R29 first month, once", async () => {
    const a = await person("Trial Thandi");
    expect((await plus.trialState(a)).can_start).toBe(true);
    expect(await plus.startTrial(a)).toBe(true);
    expect(await plus.hasPlus(a)).toBe(true);
    const t = await plus.trialState(a);
    expect(t.can_start).toBe(false);
    expect(Date.parse(t.trial_until!) - Date.now()).toBeGreaterThan(6.9 * 86400_000);
    // Not twice, and not the offer while the trial is on.
    expect(await plus.startTrial(a)).toBe(false);
    await expect(plus.startCheckout(a, "intro", "https://x.example")).rejects.toThrow(/offer has ended/);

    // The week ends: the offer opens for 48 hours.
    const store = getStore();
    const ended = new Date(Date.now() - 3600_000).toISOString();
    await store.update("memberships", a, { plus_until: ended, trial_until: ended });
    const after = await plus.trialState(a);
    expect(after.trial_until).toBeNull();
    expect(Date.parse(after.offer_until!) - Date.now()).toBeGreaterThan(46 * 3600_000);
    const pay = await plus.startCheckout(a, "intro", "https://x.example");
    await plus.testCheckout(a, pay.id, "pay");
    expect((await store.get("payments", pay.id))!.amount_cents).toBe(2900);
    expect(await plus.hasPlus(a)).toBe(true);
    // Paid once: no more offer.
    await store.update("memberships", a, { plus_until: ended });
    expect((await plus.trialState(a)).offer_until).toBeNull();

    // Offer expires after 48 hours.
    const b = await person("Late Lerato");
    await plus.startTrial(b);
    const longAgo = new Date(Date.now() - 49 * 3600_000).toISOString();
    await store.update("memberships", b, { plus_until: longAgo, trial_until: longAgo });
    expect((await plus.trialState(b)).offer_until).toBeNull();
  });

  it("doesn't give a second trial to a new account on the same number", async () => {
    const a = await person("Once Only");
    const phone = (await getStore().get("people", a))!.phone;
    await plus.startTrial(a);
    const { deleteAccount } = await import("@/lib/account");
    await deleteAccount(a);
    const again = (await findOrCreatePerson({ name: "Once Again", phone, isGuest: false })).id;
    expect(again).not.toBe(a);
    expect(await plus.startTrial(again)).toBe(false);
    expect((await plus.trialState(again)).can_start).toBe(false);
  });
});

describe("Friends vouch for you", () => {
  it("shows a vouch only after approval, at most three, and never your own", async () => {
    const me = await person("Naledi Khumalo");
    const { token } = await vouch.createVouchInvite(me);
    expect((await vouch.vouchInvite(token, null)).first_name).toBe("Naledi");
    await expect(vouch.writeVouch(token, me, "friend", "I am simply the best person")).rejects.toThrow("yourself");
    await expect(vouch.writeVouch("nope", me, "friend", "Great person to know")).rejects.toThrow("expired");

    const friends = [];
    for (const name of ["Sipho Ndlovu", "Zanele Dube", "Bongani Nkosi", "Palesa Mahlangu"]) friends.push(await person(name));
    await expect(vouch.writeVouch(token, friends[0], "friend", "short")).rejects.toThrow("Write a little more");
    await expect(vouch.writeVouch(token, friends[0], "friend", "She is an idiot honestly")).rejects.toThrow("kind and true");
    for (const [i, f] of friends.entries()) await vouch.writeVouch(token, f, i ? "cousin" : "friend", `Naledi is the kindest person I know, number ${i + 1}.`);

    expect(await vouch.shownVouches(me)).toEqual([]); // nothing shows before she says so
    const list = await vouch.vouchesAbout(me);
    expect(list.map((v) => v.status)).toEqual(["pending", "pending", "pending", "pending"]);
    for (const v of list.slice(0, 3)) await vouch.decideVouch(me, v.id, "shown");
    await expect(vouch.decideVouch(me, list[3].id, "shown")).rejects.toThrow("Up to 3");
    const shown = await vouch.shownVouches(me);
    expect(shown).toHaveLength(3);
    expect(shown[0]).toMatchObject({ relation: expect.any(String), text: expect.stringContaining("kindest") });
    expect(shown.every((v) => !v.friend.includes(" "))).toBe(true); // first names only

    // Someone else can't approve it; the friend can take theirs back.
    await expect(vouch.decideVouch(friends[0], list[0].id, "hidden")).rejects.toThrow("not found");
    const sipho = (await getStore().list("vouches", { friend_id: friends[0] }))[0];
    await vouch.withdrawVouch(friends[0], sipho.id);
    expect((await vouch.vouchesAbout(me)).length).toBe(3);
  });
});

describe("Couple space", () => {
  const sealed = (who: string) => JSON.stringify({ v: 1, sd: `device-${who}`, ct: "…" });

  it("keeps answers hidden until both have answered, then posts a content-free note", async () => {
    const a = await person("Thabo Nkosi"), b = await person("Lwazi Dlamini");
    const room = (await chat.openDirectChat(a, await phoneOf(b))).id;
    const v0 = await couple.coupleSpace(room, a);
    expect(v0.question.endsWith("?")).toBe(true);
    expect(v0).toMatchObject({ mine: null, theirs: null, partner_answered: false, streak: 0, days_together: 0, az_done: 0, next_date: null });
    expect(v0.next_anniversary.years).toBe(1);

    await couple.answerToday(room, a, sealed("a"), v0.today);
    let vb = await couple.coupleSpace(room, b);
    expect(vb).toMatchObject({ partner_answered: true, theirs: null });
    expect((await couple.coupleSpace(room, a)).theirs).toBeNull();

    await couple.answerToday(room, b, sealed("b"), v0.today);
    vb = await couple.coupleSpace(room, b);
    expect(vb.theirs).toBe(sealed("a"));
    expect(vb.streak).toBe(1);
    await expect(couple.answerToday(room, a, sealed("a2"), v0.today)).rejects.toThrow("locked");
    const msgs = await getStore().list("messages", { chat_id: room });
    expect(msgs.some((m) => m.kind === "system" && /both answered/.test(m.body ?? ""))).toBe(true);
    expect(msgs.some((m) => (m.body ?? "").includes("device-a"))).toBe(false);
  });

  it("checks dates and answers, and is only for chats of two", async () => {
    const a = await person("Musa Sithole"), b = await person("Ntombi Zwane"), c = await person("Craig Botha");
    const room = (await chat.openDirectChat(a, await phoneOf(b))).id;
    const today = couple.localDate();
    await expect(couple.answerToday(room, a, "not sealed", today)).rejects.toThrow("couldn't be read");
    await expect(couple.answerToday(room, a, sealed("a"), "2020-01-01")).rejects.toThrow("changed");
    await expect(couple.coupleSpace(room, c)).rejects.toThrow();
    await expect(couple.setTogetherSince(room, a, "2999-01-01")).rejects.toThrow("already happened");
    await couple.setTogetherSince(room, a, "2025-02-14");
    const v = await couple.coupleSpace(room, b);
    expect(v.together_since).toBe("2025-02-14");
    expect(v.days_together).toBeGreaterThan(270);
    expect(v.next_anniversary.date.endsWith("-02-14")).toBe(true);
  });
});

describe("Date deals (coming soon)", () => {
  it("records interest and venue leads with simple checks", async () => {
    const a = await person("Ayesha Patel");
    await expect(deals.notifyMe(a, " ")).rejects.toThrow("city");
    expect(await deals.notifyMe(a, "  Cape   Town ")).toMatchObject({ city: "Cape Town" });
    expect(await deals.dealInterest(a)).toBe("Cape Town");
    await expect(deals.venueLead(a, { venue: "Bean There", city: "Joburg", contact: "x" })).rejects.toThrow("email or phone");
    await deals.venueLead(a, { venue: "Bean There", city: "Joburg", contact: "hello@beanthere.co.za" });
    expect((await getStore().list("venue_leads", { person_id: a })).length).toBe(1);
  });
});
