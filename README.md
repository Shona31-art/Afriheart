# Afriheart

**Meet someone over a real date.** Afriheart is a dating app built around date ideas: every profile
shows a date the person would like to go on, and you can like them or say yes to the date. A match
opens a private, end-to-end encrypted chat with voice and video calls, and Afriheart turns the date
into a plan in the chat. Chats, groups and plans also work for friends.

It's built the same way as Grace: **the website is the app**, and a small native Android app
wraps it to add what a web page can't do, like calls that ring when the app is closed.

```
server/    Next.js app: every screen, the API, chats, calls (WebRTC signalling), plans, companion
android/   Kotlin app (adapted from Grace's): full screen, ringing calls, earpiece/speaker, icon badge
.github/   Builds afriheart.apk on GitHub and publishes it as a release; server checks
e2e/       Browser tests that drive two simulated phones (chat, voice notes, photos, plans, calls)
```

## What's in it

| Area | Features |
| --- | --- |
| Dating | **Discover**: one profile at a time with photos, age, area, bio and a date idea. Swipe or tap to pass or like, or say "Yes to the date". A mutual like or yes is a **match**: a private chat opens (phone numbers are never shown), and a yes turns that date into a plan card. Profiles need 1–6 photos, a date idea and a date of birth (18+, checked on the server). People choose who they'd like to meet (women, men, non-binary people) and an age range, and both sides must fit each other. **Safety**: report (which also blocks) or block from Discover or a chat, unmatch (the chat disappears for both), "Share date details with a friend" on the date's plan card, a safety page with SA emergency numbers, pause or delete your profile. POPIA consent is recorded before dating preferences are used |
| Compatibility | Two sets. The basics: 12 quick questions (what you're looking for, kids, smoking, drinking, weekends, texting, planning, meeting up, paying on dates, pets, disagreements, fitness). Going deeper: 16 of the questions people share on TikTok, Threads and Facebook to ask before getting serious (what counts as cheating, what makes you feel loved, making up after a fight, saving vs spending, sharing money, marriage, moving in, family, phone privacy, exes, time alone, chores, posting each other, moving cities, early bird or night owl, and the worm question just for fun). For each: your answer, the answers you'd accept, and how much it matters. The match % takes both people's view into account, weighted by importance, and needs 5 answers in common. It shows on Discover cards with "You both…", ranks the best matches first, and is broken down on the match's info screen. Only answers two people share are ever shown. No questions on religion, politics or health (POPIA special personal information) |
| Alphabet date ideas | A date for every letter, kept as a photo album, in every one-to-one chat (the A–Z button in the chat header, or chat info). Five date styles the couple chooses together (Out and about, At home, Free and cheap, Foodie, Adventure), with 10+ ideas per letter across them, or write your own. "Surprise us" picks a random letter and idea. Four album looks (Cream scrapbook, Blush florals, Midnight & gold, Sunshine), used on screen and in the export. Plan a letter straight into the chat; when you've been, add a photo, a little story, the date and a heart rating. Each page looks like a scrapbook page: big letter, script title, polaroid photo with tape, "Our story" box, date and hearts. Export the album as an A4 PDF (cover plus your pages, or all 26 blank pages to fill in by hand), or save one page as an image to share. Photos and stories are end-to-end encrypted chat messages; the album and the PDF are put together on the phone, and the server only stores letters, date names and which messages belong to which page |
| Talking cards | A question card game for two, in any chat (the + button, then Talking cards) and during voice and video calls. Four decks of 30 original questions: Thoughtful, Playful, Flirty and Future us. Both phones see the same card, live: whoever turns it over or taps Next moves it for both of you, and turns alternate, starting with whoever chose the deck. Start a call from the cards page and they come along; if the other person plays during a call, the cards open on your call screen too (unless you closed them). A double tap on Next from both phones only moves one card. "Send to chat" on a turned-over card posts it into the chat as an end-to-end encrypted card bubble, so you can answer by text when you're not on a call. The server stores the deck, a shuffle seed and the card number, not answers (you say those out loud). |
| Distance | "Use my location" (approximate, rounded to about 1 km on the server) or choose a city. Each person picks how far: 5, 10, 25, 50, 100 km or anywhere, and both people's distances must fit, like the age rules. Others only ever see a band ("Less than 5 km away"), never coordinates, so nobody can work out where someone lives. Closer people rank a little higher. The Android app asks for approximate location only (ACCESS_COARSE_LOCATION) |
| Photo verification | A live selfie taken in the app (no gallery uploads) doing a pose the server picks, like "Give a thumbs up", so it can't be an old photo. A person on the Afriheart team compares it with the profile photos and approves or rejects it with a reason. The selfie is biometric information under POPIA, so it needs explicit consent, only the team can see it, and it's deleted as soon as it's checked; only the result is kept. Verified people get a badge, rank a little higher, and can choose "Only verified people" (works both ways) |
| Super admin | **/admin**, for the Afriheart team, with three roles. **Support** answers tickets and looks people up (numbers partly hidden). **Moderators** also review reports and selfies (the /team queue), ban people (signed out everywhere at once, no new sign-in codes) and remove people from dating. **Super admins** can do everything: give Afriheart+ days, record refunds (the money goes back from the Payfast dashboard), delete accounts (type the name to confirm), post an announcement banner everyone sees, manage the team and roles, read the **activity log** of every staff action, and see venues and date-deal interest. The **dashboard** shows people (new, active), matches, dates, Afriheart+ (active, free week), revenue, the queues, and new people per day. `SUPER_ADMIN_PHONES` are always super admins; `TEAM_PHONES` are moderators. Staff can't read anyone's chats: they're end-to-end encrypted |
| Support | **/support** (You → Help and support, and "Trouble signing in? Get help" on the sign-in screen): a help centre of 25 short answers with search, emergency numbers, and **Contact support**, which also works for people who can't sign in (name and number). People choose a topic (safety goes to the top), describe the problem, can add a screenshot, and choose whether to include their phone and browser details (shown to them first). **My tickets** shows the team's replies, with a pop-up on Android and a count on the You tab; replying opens a solved ticket again. The team works through an inbox (Open, Mine, Solved) with assign, urgent and solve |
| Security | **Sessions the server can end**: the cookie holds a random token, only its hash is stored, and signing out, removing a linked device, "Sign out everywhere else" or deleting the account ends it straight away. **Security headers** on every page: Content-Security-Policy (no scripts, frames or plugins from other sites; Afriheart can't be framed), X-Frame-Options, nosniff, HSTS, Referrer-Policy and Permissions-Policy. **API proxy** (src/proxy.ts): requests from other websites are refused, bodies over 512 KB (13 MB for uploads) are refused, and every change is rate-limited per person (likes, reports, messages, uploads, verification, chats, plans, calls, plus 120 changes a minute overall). Redirects after sign-in only go to pages on Afriheart. Only photos you uploaded can go on your profile, and adding a new photo sends the verified badge back for checking |
| Your data | **Delete my account** under You: deletes the profile, photos, answers, location, verification records, everything the person sent in chats, devices, push tokens and sessions, leaving an anonymous "Deleted account" in other people's chats. Photos taken off a profile are deleted from storage. People removed by the team leave their match chats. **Privacy policy** (/privacy) and **Terms** (/terms), linked from sign-in, the profile, verification and You. Fill in the marked company details and have a lawyer review both before launch |
| Prompts and comments | Up to three written prompts ("My ideal Sunday", "A green flag I look for"…, 20 to choose from) and an optional voice prompt of up to 30 seconds. On Discover, like one photo, one answer or the voice prompt, with an optional comment. The other person sees what you liked and your comment on your card, and the match chat opens with it. Comments are sent before matching, so they aren't end-to-end encrypted (it says so where you type) |
| Today's most compatible | One pick a day: the highest match % (60% or more) among people you haven't answered, shown first in Discover with a ribbon. It doesn't change if you pass |
| Kind messages | A check that runs only on the phone, so encryption stays intact: threats, sexual harassment and insults, including disguised spellings and some South African terms. Sending one asks "Are you sure?"; receiving one blurs it with "Does this bother you?", Show message and Report (the report can include the message, so the team can see it). Also checks comments on likes |
| Double dates | The Double date tab in Discover: pair up with a friend through an invite link (WhatsApp or copy), with a date idea for four. Pairs only see pairs where everyone fits someone in the other pair both ways, with no blocks. One like from either of you counts for your pair; when both pairs like each other, a chat for four opens with a plan, phone numbers hidden |
| We met | After a planned date (a locked plan's time has passed, or an alphabet date is ticked off), each person is asked privately: did you meet, would you see them again, did they look like their photos. "No" to the photos goes to the team's report queue without saying who asked; the team page shows how many dates happened |
| Growth | Share any alphabet page or quiz result as a Story-sized image with "Made on Afriheart" and a link, through the phone's share sheet (TikTok, Instagram, WhatsApp; the Android app uses its own share bridge) or saved to photos. A public /alphabet-dates page with all 285 ideas, and a public 10-question compatibility quiz at /quiz: no account needed, send the link, both see the match % and what you share (never anyone's other answers), deleted after 30 days, rate-limited |
| Privacy | **End-to-end encrypted** messages, photos and voice notes: each phone makes its own keys and the server only stores scrambled data. Messages are signed so the server can't fake or alter them. A WhatsApp-style **security code** in chat info lets people compare in person, and a warning shows when someone's code changes. **Calls** are encrypted phone-to-phone, with their set-up signed by each phone. **Sign-in by a code** sent to your number |
| Chats | WhatsApp-style, all end-to-end encrypted. Direct chats and groups by phone number (people not on Afriheart yet get the messages when they sign in). **The message box** looks like WhatsApp's: an emoji/stickers/GIFs button, a 📎 attach menu of round buttons (Gallery, Camera, Location, Contact, Document, Poll, Event for a plan, Talking cards, Couple space), a camera button, and the microphone. **Send** text with clickable links, **emoji** (a built-in picker with 500+ emoji, search, categories and recently used; messages of only 1–3 emoji show big), **stickers** (Afriheart's own pack of 16 with South African phrases like Howzit!, Lekker!, Eish… and Braai?, plus "Make a sticker" from any photo, recent and favourite stickers, and "Add to favourite stickers" on stickers people send you), **GIFs** (from GIPHY once a key is set: searches go through Afriheart so GIPHY never sees the phone, and the GIF is sent as an encrypted file), photos (resized on the phone), **view-once photos** (the file is deleted once everyone has opened it), videos, documents, voice notes (pause and carry on recording, stop and listen before sending, a waveform you can tap or drag, 1×/1.5×/2× speed for all voice notes, and the next voice note plays by itself), your current location (sent once, not tracked), contact cards (Android can pick from the phone's contacts), **polls** (one or several answers, live counts and who voted), Talking cards and plans. **Press and hold (or right-click) a message** to react (👍 ❤️ 😂 😮 😢 🙏, or + for any emoji), reply with a quote (tap the quote to jump to it), copy, forward to up to 5 chats (labelled Forwarded; files are re-encrypted for each chat), star, edit (15 minutes), see message info (delivered, read, opened), delete for me or for everyone (about 2½ days). **typing…**, **online** and **last seen**, and ✓ sent / ✓✓ delivered / blue ✓✓ read. **Chat list**: pin up to 3 chats, mute (8 hours, a week, always; muted chats send no pop-ups), archive, mark as unread, delete chat, filters (All, Unread, Groups), Starred messages. **The ⋮ menu** in the chat header, in WhatsApp's order: View contact, Search, Media, links and docs, Mute, Disappearing messages, Chat theme, then More (Report, Block, Clear chat, Export chat, Add to list, New group with this person, Exit group). **Chat lists**: put chats in your own lists (Family, Work…), which show as filters above your chats. **Chat theme**: Afriheart doodle wallpaper (original line drawings: hearts, Ndebele triangles, braai flames, protea…), dots, plain or five colours, and five colours for your own messages, kept per chat on the phone. **In a chat**: search (done on the phone, the server can't read it), disappearing messages (24 hours, 7 days, 90 days), media/links/docs gallery, export chat to a .txt (made on the phone), clear chat. **Groups**: name and description, admins can make or dismiss admins, remove people, allow only admins to send or to change settings, and share an invite link (/join/…) they can reset; @mentions with suggestions; new members only see messages from when they joined. **Privacy** (You → Chats and privacy): hide online and last seen, turn off read receipts (both work both ways, like WhatsApp) |
| Status | Text on a colour, or a photo with a caption, for 24 hours. Your status goes to the people you chat with one-to-one (not dating matches or group members), end-to-end encrypted for each of their phones. A row of status circles above the chat list (a coloured ring means unseen); tap through, pause, reply (it arrives in your chat as a reply to the status), see who viewed yours, delete it |
| Afriheart+ | One payment, no debit order (nothing renews by itself): 1 week R19, 1 month R59, 3 months R149, through **Payfast** (card, Instant EFT, Capitec Pay, SnapScan, Zapper, Apple Pay and Google Pay, whichever are switched on in the Payfast account). Passes add their days on top of time left. Adds **Likes you** (see who liked you and match straight away) and the **Flirty** and **Future us** Talking cards decks (one person with Plus unlocks them for both). Chats, calls, matching and safety stay free. **Free week**: 7 days of Afriheart+ starts automatically when someone finishes a dating profile with a photo (or from the Afriheart+ page), once per phone number, even if the account is deleted and made again; no card needed. When it ends, a **welcome offer** of R29 for the first month is shown for 48 hours, once, and only to people who have never paid. Payment records are kept for the books and never hold card details |
| Friends vouch for you | Ask a friend to vouch with a link (lasts 14 days). They choose friend, sibling, cousin, colleague or classmate and write a line (10–200 characters, checked for unkind words). You approve each one before it shows; up to 3 show on your Discover card as "What friends say", with first names only. Hide or remove any time |
| Couple space | In any one-to-one chat (chat info, or the + button): a question of the day (60 questions, the same for both of you, answers end-to-end encrypted and only shown once you've both answered, then a note in the chat), a streak, days together and the next anniversary (change the date you got together), your next planned date and A–Z progress |
| Date deals and events | **Coming soon**, with "Notify me" by area and a form for restaurants, cafés and venues to sign up before launch |
| Data-light mode | You → Data: automatic (follows the phone's data saver), always on or off. Small copies of profile photos, chat photos and voice notes only load when tapped, smaller photo uploads, voice notes at 16 kbps, video calls at 320×240 / 15 fps. Shows how much data Afriheart used on this phone this week |
| Calls | Voice and video calls from any chat, including group calls of up to 6 phones (a mesh). Full-screen ringing anywhere in the app, ringback for the caller, mute, camera on/off, switch camera, speaker. Call lines in the chat ("📞 Voice call · 2:34", missed, declined). Calls tab with history |
| Plans in chats | Tap ✨ or type `@afri braai on Saturday`. The companion drafts options as a live card. The organiser opens voting and everyone votes, says In/Maybe/Out and checks in from the card. The companion announces each step in the chat and nudges the maybes there |
| Look and feel | "Malachite and gold" (see `brand/README.md`): Bodoni Moda and Hanken Grotesk, porcelain and malachite by day, near-black green and champagne gold by night, profile portraits in a fine gold frame. Follows the phone's light or dark setting. On computers (1024px+) there are two panes like WhatsApp Web: chats on the left, the conversation on the right. Line icons, and contrast checked with an accessibility scanner in both modes |
| Plans tab | Everything you're organising or invited to, Circles (recurring groups), and the guest web link for people without the app |
| Android app | Ringing over the lock screen with Decline/Answer even when closed, a "call in progress" notification, earpiece and loudspeaker, unread number on the icon, message pop-ups |

## Run it

```bash
cd server
npm install
npm run dev            # http://localhost:3000. Open it in two browsers to chat or call yourself
npm test               # unit tests
```

With nothing configured, data is stored in `server/.data/` and the companion uses the built-in
Durban guide. Calls work between two browsers on the same network. Phones on different networks
usually connect too; for strict mobile networks, add a TURN relay (see below).

## Put it online

1. **Supabase.** Create a project, then run `server/supabase/migrations/*.sql` in order, followed
   by `server/supabase/seed.sql`. This also creates the private `chat-media` bucket.
2. **Vercel** (or any Node host). Set the root directory to `server`, then add these variables:

   | Variable | Value |
   | --- | --- |
   | `SESSION_SECRET` | 32+ random characters |
   | Sign-in codes: one of these | `MAKE_WEBHOOK_URL` (+ `MAKE_WEBHOOK_SECRET`): your Make.com scenario sends the code by WhatsApp or SMS, as Grace's alerts do. The scenario receives `{ type: "verification_code", phone, code, text }`. **Or** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`). **Or** `BULKSMS_TOKEN_ID`, `BULKSMS_TOKEN_SECRET`. **Or, free:** `TEXTBEE_API_KEY` (+ optional `TEXTBEE_DEVICE_ID`): the textbee.dev app on an Android phone sends codes from its own SIM. Paid senders take priority when set, so you can switch later without removing it. **Or, free and fully yours:** `SMS_GATEWAY_TOKEN` (32+ random characters): the Afriheart Codes app (`android/gateway`, built by the "Afriheart Codes app" workflow) on a spare Android phone collects codes from `/api/sms-gateway` every few seconds and sends them from its SIM. Without one, sign-in is switched off in production |
   | `NEXT_PUBLIC_APP_URL` | Your site, e.g. `https://common.example.com` |
   | `ALLOW_LOCAL_STORE` | Leave unset in production. Without Supabase settings the app now refuses to start in production, instead of quietly saving to a local file that hosting wipes. Set `yes` only for a single server with a persistent disk, or for running the browser tests against `next start` |
   | `WHATSAPP_NUMBER`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Free sign-in by WhatsApp (recommended). People send "Afriheart code 123456" to your WhatsApp Business number and are signed in when Meta's webhook confirms it came from their number; Afriheart never replies, so it costs nothing. In your Meta app: WhatsApp → Configuration → Callback URL `https://<your site>/api/whatsapp/webhook`, Verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**. SMS (above) stays available as the backup |
   | `SUPER_ADMIN_PHONES` | Your own number(s), comma separated: always super admins in /admin (so you can't lock yourself out). Add everyone else in /admin → Team |
   | `PAID_APP` | Afriheart is a paid app: after the free trial, only safety (report, block, unmatch), support, the profile, account and payment pages stay open; everything else asks for a membership (checked for every page and API call in `src/proxy.ts`, see `src/lib/membership.ts`). The Afriheart team is never locked out. Set `PAID_APP=off` to open everything (the older end-to-end suites run with it off) |
   | `FOUNDING_MEMBERS`, `FOUNDING_DAYS` | Founding-member launch offer: the first `FOUNDING_MEMBERS` people (e.g. 100) get `FOUNDING_DAYS` (default 30) of Afriheart+ free instead of 7 days. The Afriheart+ page shows how many spots are left |
   | `SUPER_ADMIN_PASSWORD` | Optional, 16+ characters: super admins can sign in at `/signin/admin` with their number and this password instead of a code. Tries are limited and every sign-in is logged in /admin → Activity |
   | `TEAM_PHONES` | Optional: numbers that are moderators (safety queue in /team, and /admin) without adding them in /admin |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Project settings → API |
   | `GEMINI_API_KEY` | Optional: AI-written plan options |
   | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Optional: relay for calls on strict networks |
   | `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_ANDROID_APP` | Optional: ring Android phones when the app is closed (step 4) |
   | `NEXT_PUBLIC_ANDROID_APK_URL` | `https://github.com/<you>/<repo>/releases/latest/download/afriheart.apk` |
   | `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | Afriheart+ payments: from your Payfast account (Settings → Developer settings). Set a passphrase there and use the same one here. Payfast must be able to reach `https://<your site>/api/plus/payfast`, so `NEXT_PUBLIC_APP_URL` must be the public address |
   | `PAYFAST_SANDBOX` | `yes` to use Payfast's sandbox (test cards) while you try it. Remove for real payments |
   | `PLUS_TRIAL` | `off` to switch off the free week (on by default) |
   | `GIPHY_API_KEY` | Optional: switches on GIFs. Get a key at developers.giphy.com (the free beta key is limited to 100 searches an hour; apply for a production key before launch, and keep the "Powered by GIPHY" credit the app shows). `ALLOW_TEST_GIFS=yes-insecure` gives pretend GIFs for local tests only |
   | `ALLOW_TEST_PAYMENTS` | Only for local testing: `yes-insecure` shows a pretend checkout instead of Payfast. Never set it in production |

3. **Android app (GitHub builds it).** Push this folder to a GitHub repo. Then add:
   - Secret `ANDROID_KEYSTORE_PASSWORD`: the password I gave you separately. It unlocks
     `android/common-release.p12`. **Never lose it**, or updates won't install over the old version.
   - Variable `AFRIHEART_SITE_URL`: your live site.

   Then go to Actions → Android app → Run workflow. `afriheart.apk` appears under Releases, and
   people install it from the "Download the Android app" button on the You tab.
4. **Calls ringing when the app is closed (Firebase, free).** These are the same steps as Grace.
   Create a Firebase project, add an Android app with package `africa.common.app`, and paste
   `google-services.json` into `FIREBASE_ANDROID_APP`. Then generate a service-account private
   key and paste it into `FIREBASE_SERVICE_ACCOUNT`, and redeploy. Phones register themselves
   when the app opens.

**Afriheart+ in app stores.** Payfast works on the website and the Android app installed from
GitHub. If you later publish on Google Play or the App Store, their rules require their own
billing (they take 15–30%) for digital extras like Afriheart+; plan for that before submitting.

**iPhone:** open the site in Safari → Share → Add to Home Screen. Chats, voice notes and calls
work while the app is open. Like Grace, there's no native iPhone app, so calls only ring when
Afriheart is open.

## How the privacy works

- **Sign-in codes.** A 6-digit code is sent to the number. It lasts 10 minutes and allows 5 tries.
  You can ask for one code every 45 seconds, 5 per number per hour, and 20 per network per hour.
  Only a hash of each code is stored. Guests joining a plan from a link confirm their number the same way.
- **End-to-end encryption** (`server/src/lib/e2e-crypto.ts`). Each phone makes an encryption key
  pair and a signing key pair; the private halves can't be exported and never leave the phone.
  Each message gets a fresh key, which is wrapped separately for every phone in the chat
  (ECDH P-256 + HKDF + AES-256-GCM). The whole message is signed (ECDSA), so the server can't
  read, change, re-route or forge messages. Photos and voice notes are encrypted on the phone
  before upload. The server also refuses a message that wasn't encrypted for every phone in the
  chat, so nobody can be silently left out.
- **WhatsApp-style extras keep this.** Replies, edits, reactions and poll votes are small
  encrypted messages "about" another message: the server only knows which message they're about
  and whether it's a reaction, an edit or a vote, never the emoji, the text or the choice. Search,
  the media gallery and chat export happen on the phone. Status updates are encrypted for each
  contact's phones. Typing and online signals are sent to the chat's phones and never stored;
  "last seen" is stored as one time per person.
- **What the server can still see:** who talks to whom and when, message sizes, and anything
  sent to the assistant (`@afri …`, plans and their cards). The assistant has to read those to
  help, just as WhatsApp's business and AI chats aren't end-to-end encrypted.
- **New phones.** Like WhatsApp without a backup, a new phone can't read messages sent before it
  was set up. For someone who wasn't on Afriheart at all yet, the sender's phone re-sends the key
  automatically once they join ("Waiting for this message" turns into the message).
- **Compared with WhatsApp (Signal protocol):** there's no per-message key ratchet yet. If a
  phone's private key were somehow stolen, messages sent to that phone could be decrypted.
  Adopting a ratchet (e.g. libsignal) is the next step if you want that level.
- **Calls** are encrypted between phones by WebRTC. Each phone signs its call set-up, and the other
  phone only connects if the signature belongs to the person it's calling.

## Before a public launch

- **Dating moderation.** Reports are saved in the `reports` table, but there's no team screen
  yet to review them, warn or ban people. Build one, and agree on response times, before launch.
- **Photo verification.** Profiles aren't verified yet. A selfie check (a video selfie compared
  with the profile photos, through a provider such as AWS Rekognition, Persona or Onfido) is the
  main defence against catfishing and romance scams.
- **Photo moderation.** Uploaded photos aren't checked for nudity or for photos of other people.
  Add an image moderation service before opening sign-ups.
- **Age.** The 18+ rule uses the date of birth people enter. For stronger assurance, add ID or
  selfie age estimation.
- **Location.** Discover matches by stated area and city only. Add distance from an approximate
  location (never shown to others) when you expand beyond Durban.

- **Realtime.** Each signed-in phone keeps one live connection (`/api/events`). After a message,
  tick, plan change or call signal, the server sends a small "something changed in chat X" nudge
  (never the content, which stays end-to-end encrypted), and the phone fetches what's new. A slow
  30-second check runs as a backup, and phones go back to quick checks if the connection drops.
  With Supabase configured, nudges travel over Supabase Realtime broadcast (topics are a keyed
  hash of the person's id), so it works across several servers. Set `REALTIME=memory` for a
  single server. The Supabase path is written but **not yet tested against a live project**:
  try it on staging first. Measured locally: messages arrive in about 0.2 s (it was 1.5 s), an
  open idle chat makes 0 requests in 20 s (it was about 13), and calls ring in about 0.4 s.
- **Big files.** Photos, videos and documents go through the server (up to 12 MB). Many hosts
  limit request size (Vercel: 4.5 MB per request), so for bigger videos switch uploads to direct
  Supabase Storage uploads with signed URLs.
- **City guide.** `server/src/lib/guide.ts` is sample Durban data. Curate it.
- **POPIA.** Publish a privacy notice, record consent at sign-up, and support account deletion.

## Tests

`e2e/phones.mjs` signs phones in with codes and checks 50 things: encryption (no readable text or photos on the server, matching security codes, new-phone warnings, a newcomer reading earlier messages): messaging, unread badges, read ticks,
a voice note, a photo, a plan voted on and locked inside the chat, and a voice call and a video
call that both connect with media flowing. It also covers a declined call, a group, and call
history. `e2e/dating.mjs` runs three people through dating: profiles, an under-18 refused, Discover, a report and block (including photo access), a match via a date idea with a plan in the chat, hidden phone numbers and unmatching. `e2e/features.mjs` covers prompts and comments, voice prompts, today's most compatible, the kind-messages check, double dates and We met. `e2e/growth.mjs` covers the public alphabet page, the quiz and sharing Story images. `e2e/audit.mjs` runs security probes (outsider access, redirects, revoked sessions, rate limits, request size, other-site requests, headers) and should report 0 problems. `e2e/verify.mjs` covers distance, verification and the team queue (start the server with TEAM_PHONES=0825559999). `e2e/az.mjs` covers the alphabet date ideas album end to end, including the PDF export. `e2e/compat.mjs` covers the question flow, match % and ranking, and checks that raw answers are never sent to other people. `e2e/dark.mjs` renders dark mode and the computer layout and runs the axe accessibility scan. `e2e/loop.mjs` covers the plan page, guest RSVP, check-ins and Circles. `e2e/cards.mjs` plays Talking cards on two phones, in the chat, on top of a video call, and by text with Send to chat. `e2e/realtime.mjs` measures message and call speed, checks an idle chat makes no requests, and checks the backup polling when the live connection is blocked. `e2e/more.mjs` covers friends vouching, Afriheart+ with the test checkout, Likes you, Plus decks, Couple space, data-light mode and date deals (run the server with `ALLOW_TEST_PAYMENTS=yes-insecure PLUS_TRIAL=off`). `e2e/expressions.mjs` covers the message box, attach menu, emoji, any-emoji reactions, stickers (pack, made from a photo, favourites), GIFs (`ALLOW_TEST_GIFS=yes-insecure`), voice notes (pause, listen first, waveform, speed, play next), the ⋮ menu, chat themes, chat lists, export and New group with. `e2e/admin.mjs` covers the support page signed in and out, the admin dashboard, support replies, gifts of Afriheart+, announcements, roles, banning and the activity log (start the server with `SUPER_ADMIN_PHONES=0825558888`). `e2e/whatsapp.mjs` covers the WhatsApp-style chat features on three phones: online and typing, reactions, replies, edits, stars, polls, location, contacts, documents, view once, message info, delete for me, search, forwarding, disappearing messages, pin/mute/archive/unread, @mentions, group admin settings and invite links, status updates, privacy settings and the free week. They use
Playwright and Chrome with a fake camera and microphone. Start the server with `OTP_PROVIDER=test`
(it shows codes on screen; refused in production unless `ALLOW_TEST_OTP=yes-insecure`), then run
`BASE=http://localhost:3000 node e2e/phones.mjs`.

## Brand

The name is **Afriheart**. The logo, colours and app icons are in `brand/` (see `brand/README.md`). The sticker pack (`brand/make-stickers.py`) and the chat wallpaper (`brand/make-doodles.py`) are drawn from the same colours and rebuilt with those scripts. The app icons in `server/public` and the Android launcher and status-bar icons are made from it. Internal code names (the Android package `africa.common.app`, the encryption label `common-e2e-v1`, the local database file) stay as they were: changing them would break push setup, app updates and existing encrypted messages, and nobody sees them. The plan assistant answers `@afri …` (and still `@common …`).
