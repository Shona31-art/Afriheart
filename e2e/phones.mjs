// Two simulated phones: chat, ticks, voice note, photo, plan card, voice + video calls.
import { chromium } from "playwright"; // npm i -D playwright axe-core
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const SHOTS = new URL("./shots/phones", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log("•", ...a);
const seen = (loc, timeout = 15000) => loc.filter({ visible: true }).first().waitFor({ timeout }).then(() => true, () => false);
let A, B;
const assert = async (c, m) => {
  if (!c) {
    await A?.screenshot({ path: `${SHOTS}/FAIL-A.png` }).catch(() => {});
    await B?.screenshot({ path: `${SHOTS}/FAIL-B.png` }).catch(() => {});
    throw new Error("ASSERT: " + m);
  }
  log("ok:", m);
};

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone", "camera"], hasTouch: false };
A = await (await browser.newContext(phone)).newPage();
B = await (await browser.newContext(phone)).newPage();
for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", (e) => console.log(`[${n} pageerror]`, e.message));
if (process.env.TRACE) for (const [n, p] of [["A", A], ["B", B]]) p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/events")) console.log(`[${n}] ${Date.now() % 100000} ${r.method()} ${u.pathname}${u.search.slice(0, 30)}`); });
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function enterCode(p) {
  await p.waitForURL((u) => u.searchParams.get("step") === "code");
  const code = await p.locator("[data-test-code]").getAttribute("data-test-code");
  await p.getByLabel("Code").fill(code);
  await p.getByRole("button", { name: "Verify" }).click();
}
async function signIn(p, name, number) {
  await p.goto(`${BASE}/signin?next=/`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Mobile number").fill(number);
  for (let i = 0; ; i++) {
    await p.getByRole("button", { name: "Send me a code" }).click();
    await p.waitForURL((u) => u.searchParams.get("step") === "code" || u.searchParams.has("error"));
    // The same number asked for a code moments ago (the app is quick now): wait out the cooldown.
    if (!new URL(p.url()).searchParams.get("error")?.includes("just sent") || i > 8) break;
    await p.waitForTimeout(5000);
    await p.goto(`${BASE}/signin?next=/`);
    await p.getByLabel("Your name").fill(name);
    await p.getByLabel("Mobile number").fill(number);
  }
  await enterCode(p);
  await p.waitForURL((u) => u.pathname === "/");
}

// 0. Sign-in needs the code sent to the phone
await A.goto(`${BASE}/signin?next=/`);
await A.getByLabel("Your name").fill("Lwazi Dlamini");
await A.getByLabel("Mobile number").fill("082 555 0101");
await A.getByRole("button", { name: "Send me a code" }).click();
await A.waitForURL((u) => u.searchParams.get("step") === "code");
await A.getByLabel("Code").fill("000000");
await A.getByRole("button", { name: "Verify" }).click();
await assert(await seen(A.getByRole("alert").getByText(/code isn't right/)), "a wrong code is refused");
const real = await A.locator("[data-test-code]").count();
await assert(real === 0, "the code isn't shown again on the retry page");
await A.getByRole("button", { name: "Send a new code" }).click();
await assert(await seen(A.getByRole("alert").getByText(/just sent/)), "codes can't be requested again straight away");
await A.waitForTimeout(46000); // wait out the resend window
await signIn(A, "Lwazi Dlamini", "082 555 0101");
await assert(new URL(A.url()).pathname === "/", "the right code signs in");
await signIn(B, "Thabo Nkosi", "083 555 0202");
await assert(await seen(A.getByText("No chats yet")), "new person starts with no chats");

// 1. A messages B by number
await A.getByRole("link", { name: "New chat" }).first().click();
await A.getByLabel("Their mobile number").fill("083 555 0202");
await A.getByRole("button", { name: "Open chat" }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
const chatUrl = A.url();
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Hey Thabo! Keen for something this weekend?");
await A.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(A.getByText("Hey Thabo! Keen")), "message appears for the sender");
await assert(await seen(A.getByLabel("sent").or(A.getByLabel("delivered")).first()), "sender sees a tick");

// 2. B sees it in the chat list with an unread badge, opens it → A gets blue ticks
await B.reload();
await assert(await seen(B.getByText("Lwazi Dlamini")), "chat shows up in B's list");
await assert(await seen(B.locator("a[href^='/chats/'] span.bg-accent").filter({ hasText: "1" })), "unread badge on B's chat");
await shot(B, "01-chat-list");
await B.getByText("Lwazi Dlamini").first().click();
await B.waitForURL("**/chats/**");
await assert(await seen(B.getByText("Hey Thabo! Keen")), "B reads the message");
await assert(await seen(A.getByLabel("read")), "A sees blue read ticks");
await B.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Yes! Let's do something outdoors 🙌");
await B.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(A.getByText("Let's do something outdoors")), "reply arrives on A without reloading");

// 2b. The server only has scrambled text
const { readFileSync, readdirSync, statSync } = await import("node:fs");
// The first message went out before Thabo's phone had keys; give his key a moment to be re-sent and saved.
let db = readFileSync(process.env.DB || "/tmp/common-p.json", "utf8");
for (let i = 0; i < 20 && Object.keys(JSON.parse(JSON.parse(db).messages.find((m) => m.kind === "encrypted").cipher).keys).length < 2; i++) {
  await A.waitForTimeout(250);
  db = readFileSync(process.env.DB || "/tmp/common-p.json", "utf8");
}
await assert(!db.includes("Hey Thabo") && !db.includes("something outdoors"), "messages are stored encrypted (no readable text on the server)");
const envelope = JSON.parse(JSON.parse(db).messages.find((m) => m.kind === "encrypted").cipher);
await assert(Object.keys(envelope.keys).length === 2 && envelope.sig, "each message is encrypted for both phones and signed");

// 2c. Both phones see the same security code
await A.goto(`${chatUrl}/info`);
await B.goto(`${chatUrl}/info`);
const codeA = A.locator("[data-security-code]");
const codeB = B.locator("[data-security-code]");
await A.waitForFunction(() => /\d{5}/.test(document.querySelector("[data-security-code]")?.getAttribute("data-security-code") ?? ""));
await B.waitForFunction(() => /\d{5}/.test(document.querySelector("[data-security-code]")?.getAttribute("data-security-code") ?? ""));
await assert((await codeA.getAttribute("data-security-code")) === (await codeB.getAttribute("data-security-code")), "security codes match on both phones");
await A.goto(chatUrl);
await B.goto(chatUrl);

// 3. Voice note from B
await B.getByRole("button", { name: "Record voice note" }).click();
await assert(await seen(B.getByText(/Recording/)), "recording bar shows");
await B.waitForTimeout(2200);
await B.getByRole("button", { name: "Send voice note" }).click();
await assert(await seen(A.getByRole("button", { name: "Play voice note" })), "voice note arrives on A");
const audioOk = await A.locator("audio").first().evaluate((a) => new Promise((res) => {
  if (a.readyState >= 1) return res(a.duration > 0 || a.duration === Infinity);
  a.onloadedmetadata = () => res(a.duration > 0 || a.duration === Infinity);
  a.onerror = () => res(false);
  setTimeout(() => res(false), 8000);
}));
await assert(audioOk, "voice note file loads and plays");

// 4. Photo from A
await A.getByRole("button", { name: "Photo, plan, cards and more" }).click();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNk+M/AwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==", "base64");
await A.locator("section[aria-label=\"Write a message\"]").filter({ visible: true }).locator("[data-photo-input]").setInputFiles(new URL("./beach.jpg", import.meta.url).pathname);
await A.getByLabel("Caption").fill("Look at this spot");
await A.getByRole("button", { name: "Send photo" }).click();
await assert(await seen(B.getByRole("img", { name: "Photo" })), "photo arrives on B");
await assert(await seen(B.getByText("Look at this spot")), "with its caption");
const imgOk = await B.getByRole("img", { name: "Photo" }).first().evaluate((i) => new Promise((r) => (i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(i.naturalWidth > 0)))));
await assert(imgOk, "photo decrypts and shows");
const mediaDir = process.env.MEDIA || "/tmp/common-media";
const files = readdirSync(mediaDir, { recursive: true }).map(String).filter((f) => f.endsWith(".bin"));
await assert(files.length >= 2 && files.every((f) => { const b = readFileSync(`${mediaDir}/${f}`); return !(b[0] === 0xff && b[1] === 0xd8) && statSync(`${mediaDir}/${f}`).size > 0; }), "photos and voice notes are stored encrypted");

// 5. Companion makes a plan in the chat
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("@common trail run at Giba Gorge on Sunday morning");
await A.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(A.getByRole("button", { name: "Open voting in this chat" }), 20000), "plan card drafted for the organiser");
await assert(await seen(B.getByText(/is choosing the options/)), "B sees the draft card, not the options");
await shot(A, "02-plan-draft");
await A.getByRole("button", { name: "Open voting in this chat" }).click();
await assert(await seen(B.getByText(/Voting is open for/)), "companion announces voting in the chat");
const firstWorks = B.getByRole("button", { name: /^Works/ }).first();
await assert(await seen(firstWorks), "B can vote from the card");
await firstWorks.click();
await assert(await seen(B.getByRole("button", { name: /^Works for me/, pressed: true }).first()), "B's vote registered");
await B.getByRole("button", { name: /^I'm in/ }).click();
await assert(await seen(A.getByRole("button", { name: /^I'm in · 2/ })), "A sees 2 people in");
await shot(B, "03-plan-voting");
await A.getByRole("button", { name: "Confirm top choice now" }).click();
await assert(await seen(B.getByText(/It's on: /)), "companion announces the locked plan to B");
await shot(B, "04-plan-locked");

// 6. Voice call A → B
await A.getByRole("button", { name: "Voice call", exact: true }).click();
await A.waitForURL("**/call/**");
await assert(await seen(A.getByText("Ringing…")), "A hears ringing");
const answer = B.getByRole("button", { name: "Answer" });
await assert(await seen(answer, 10000), "B's phone rings with a full-screen incoming call");
await shot(B, "05-incoming-call");
await answer.click();
await B.waitForURL("**/call/**");
await assert(await seen(A.locator("[data-connected='1']"), 25000), "A's phone connects to B");
await assert(await seen(B.locator("[data-connected='1']"), 25000), "B's phone connects to A");
const flowing = await B.locator("audio[data-remote-audio]").evaluate((a) => !!a.srcObject && a.srcObject.getAudioTracks().length > 0);
await assert(flowing, "B receives A's audio track");
await A.waitForTimeout(3000);
await shot(A, "06-voice-call");
await A.getByRole("button", { name: "End call" }).click();
await A.waitForURL("**/chats/**");
await B.waitForURL("**/chats/**", { timeout: 20000 });
await assert(await seen(A.getByText(/📞 Voice call · 0:0\d/)), "call shows in the chat with its length");

// 7. Video call B → A
await B.getByRole("button", { name: "Video call", exact: true }).click();
await B.waitForURL("**/call/**");
await assert(await seen(A.getByRole("button", { name: "Answer" }), 10000), "A rings for video");
await A.getByRole("button", { name: "Answer" }).click();
await assert(await seen(A.locator("video[data-remote-video]"), 25000), "A gets B's video");
const videoOk = await A.locator("video[data-remote-video]").evaluate((v) => new Promise((r) => {
  const ok = () => v.videoWidth > 0;
  if (ok()) return r(true);
  const t = setInterval(() => ok() && (clearInterval(t), r(true)), 300);
  setTimeout(() => { clearInterval(t); r(false); }, 12000);
}));
await assert(videoOk, "remote video is playing (has frames)");
await A.waitForTimeout(1500);
await shot(A, "07-video-call");
await B.getByRole("button", { name: "End call" }).click();
await A.waitForURL("**/chats/**", { timeout: 20000 });
await assert(await seen(A.getByText(/📹 Video call · /)), "video call logged in the chat");

// 8. Declined call
await A.getByRole("button", { name: "Voice call", exact: true }).click();
await A.waitForURL("**/call/**");
await assert(await seen(B.getByRole("button", { name: "Decline" }), 10000), "B rings again");
await B.getByRole("button", { name: "Decline" }).click();
await A.waitForURL("**/chats/**", { timeout: 20000 });
await assert(await seen(A.getByText(/Voice call · declined/)), "declined call logged");

// 9. Group with a person not on Afriheart yet
await A.goto(`${BASE}/chats/new`);
await A.getByRole("tab", { name: "New group" }).click();
await A.getByLabel("Group name").fill("Sunday runners");
await A.getByLabel("Mobile numbers, one per line").fill("083 555 0202\n084 555 0303");
await A.getByRole("button", { name: "Create group" }).click();
await A.waitForURL((u) => /^\/chats\/[0-9a-f-]{36}$/.test(u.pathname));
await assert(await seen(A.getByText('created the group "Sunday runners"')), "group created");
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Welcome to the group 🏃");
await A.getByRole("button", { name: "Send", exact: true }).click();
await B.goto(BASE);
await assert(await seen(B.getByText("Sunday runners")), "B sees the new group");

// 9b. Someone who wasn't on Afriheart yet joins later and can still read the group's messages
const C = await (await browser.newContext(phone)).newPage();
await signIn(C, "Ayesha Khan", "084 555 0303");
await A.goto(A.url()); // Lwazi's phone is online, so it re-sends the key
await C.getByText("Sunday runners").first().click();
await assert(await seen(C.getByText("Welcome to the group 🏃"), 30000), "a newcomer can read messages sent before they joined (the sender's phone re-sent the key)");
await shot(B, "08-chat-list-after");

// 10. Calls tab
await B.goto(`${BASE}/calls`);
await assert(await seen(B.getByText("Lwazi Dlamini").first()), "calls tab lists the history");
await shot(B, "09-calls");
await A.goto(chatUrl);
await A.waitForTimeout(1500);
await shot(A, "10-thread");

// 11. Thabo signs in on a second phone: Lwazi is told the security code changed
const B2 = await (await browser.newContext(phone)).newPage();
await signIn(B2, "Thabo Nkosi", "083 555 0202");
await B2.goto(chatUrl);
await assert(await seen(B2.getByText(/started using a new phone|Waiting for this message|Say hi/)), "new phone opens the chat");
await A.goto(chatUrl);
await assert(await seen(A.getByText(/Thabo started using a new phone or browser/)), "Lwazi is warned that Thabo's security code changed");
await A.getByLabel("Message", { exact: true }).filter({ visible: true }).fill("Message for both of Thabo's phones");
await A.getByRole("button", { name: "Send", exact: true }).click();
await assert(await seen(B2.getByText("Message for both of Thabo's phones")), "new messages reach Thabo's new phone");
await B.goto(chatUrl);
await assert(await seen(B.getByText("Message for both of Thabo's phones")), "and his first phone");
await assert(await seen(B2.getByText(/Waiting for this message/)), "older messages can't be read on the new phone (they weren't encrypted for it)");

console.log("\nALL PHONE CHECKS PASSED");
await browser.close();
