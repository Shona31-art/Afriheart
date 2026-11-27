// Core domain objects for Afriheart. These mirror the Supabase tables in
// supabase/migrations and the local JSON store, field for field.

export type PlanState = "shaping" | "deciding" | "locked" | "done" | "dropped";
export type Category = "food" | "outdoors" | "sport" | "events" | "celebrate" | "other";
export type Response = "in" | "maybe" | "out";
export type ActionStatus = "suggested" | "prepared" | "authorised" | "done" | "failed";
export type ActionKind = "propose" | "poll" | "nudge" | "lock" | "reminder" | "outcome" | "circle";

export interface Person {
  id: string;
  name: string;
  phone: string;
  is_guest: boolean;
  home_area: string | null;
  budget: "low" | "mid" | "high" | null;
  availability: string[]; // e.g. ["sat-am", "sun-pm", "weeknight"]
  created_at: string;
  /** When this person's phone was last connected (for "online" and "last seen"). */
  last_seen_at?: string | null;
  /** Privacy: hide "online" and "last seen" (and see nobody else's, like WhatsApp). */
  hide_last_seen?: boolean;
  /** Privacy: no blue ticks in direct chats, either way. */
  read_receipts_off?: boolean;
  /** Banned by the Afriheart team: can't sign in. */
  banned_at?: string | null;
  banned_reason?: string | null;
}

export interface Plan {
  id: string;
  slug: string;
  organiser_id: string;
  circle_id: string | null;
  chat_id: string | null;
  title: string;
  spark: string;
  category: Category;
  state: PlanState;
  min_people: number;
  decision_deadline: string | null;
  locked_option_id: string | null;
  ai_source: "gemini" | "offline";
  ai_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanOption {
  id: string;
  plan_id: string;
  what: string;
  where_name: string;
  starts_at: string;
  est_cost_per_person: number | null;
  note: string | null;
  source: "companion" | "person";
  created_by: string | null;
  created_at: string;
}

export interface Vote {
  id: string;
  plan_id: string;
  option_id: string;
  person_id: string;
  created_at: string;
}

export interface Commitment {
  id: string;
  plan_id: string;
  person_id: string;
  response: Response;
  updated_at: string;
}

export interface Checkin {
  id: string;
  plan_id: string;
  person_id: string;
  again: boolean | null;
  created_at: string;
}

export interface Circle {
  id: string;
  name: string;
  organiser_id: string;
  category: Category;
  created_at: string;
}

export interface CircleMember {
  id: string;
  circle_id: string;
  person_id: string;
  created_at: string;
}

export interface CompanionAction {
  id: string;
  plan_id: string;
  kind: ActionKind;
  status: ActionStatus;
  summary: string;
  link: string | null;
  target_person_id: string | null;
  created_at: string;
}

export interface Memory {
  id: string;
  person_id: string;
  kind: "profile" | "learned";
  text: string;
  evidence: string | null;
  created_at: string;
}

export interface GuideItem {
  id: string;
  city: string;
  name: string;
  category: Category;
  area: string;
  description: string;
  best_slots: string[]; // e.g. ["sat-am", "sun-am"]
  est_cost: number | null;
}

export interface Chat {
  id: string;
  kind: "direct" | "group";
  /** "match": opened by a dating match. Phone numbers are never shown in these chats. */
  origin?: "contacts" | "match" | "double";
  name: string | null;
  created_by: string;
  created_at: string;
  last_message_at: string;
  /** Group description. */
  description?: string | null;
  /** Disappearing messages: new messages are deleted this many seconds after sending. */
  disappear_secs?: number | null;
  /** Groups: only admins can send messages. */
  admins_only_send?: boolean;
  /** Groups: only admins can change the name, description and timer. */
  admins_only_info?: boolean;
  /** Groups: anyone with the link /join/<token> can join. Admins can reset it. */
  invite_token?: string | null;
}

export interface ChatMember {
  id: string;
  chat_id: string;
  person_id: string;
  role: "admin" | "member";
  last_read_at: string | null;
  last_delivered_at: string | null;
  joined_at: string;
  pinned_at?: string | null;
  /** Muted until this time ("9999-…" = always). */
  muted_until?: string | null;
  archived?: boolean;
  marked_unread?: boolean;
  /** "Clear chat": messages before this aren't shown to this person. */
  cleared_at?: string | null;
  /** "Delete chat": hidden from the list until a newer message arrives. */
  hidden_at?: string | null;
}

export type MessageKind = "text" | "image" | "voice" | "plan" | "companion" | "system" | "call" | "encrypted" | "like";

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string | null; // null = companion or system
  kind: MessageKind;
  body: string;
  media_path: string | null;
  media_ms: number | null;
  plan_id: string | null;
  call_id: string | null;
  /** End-to-end encrypted envelope (JSON). The server can't read it. */
  cipher: string | null;
  /** People who had no device yet when this was sent; the sender's phone re-sends the key once they do. */
  awaiting: string[];
  created_at: string;
  /** Set when the message changes after sending (key re-sent, deleted), so phones refresh it. */
  updated_at: string | null;
  /** A hidden helper message about another one (still encrypted): a reaction, an edit or a poll vote. */
  meta?: MessageMeta | null;
  target_id?: string | null;
  /** Disappearing messages: deleted after this. */
  expires_at?: string | null;
  /** View-once photos: who has opened it. */
  opened_by?: string[];
}

export type MessageMeta = "react" | "edit" | "vote";

export interface Star { id: string; person_id: string; chat_id: string; message_id: string; created_at: string }
export interface MessageHide { id: string; person_id: string; chat_id: string; message_id: string; created_at: string }
/** A 24-hour status update, end-to-end encrypted for the person's contacts. */
export interface StatusUpdate { id: string; person_id: string; cipher: string; media_path: string | null; created_at: string; expires_at: string }
/** "Add to list": the person's own chat lists (Family, Work…), shown as filters on the chat list. */
export interface ChatListRow { id: string; person_id: string; name: string; chat_ids: string[]; created_at: string }
/** Afriheart staff (id = person id). Super admins can do everything; moderators handle safety; support answers tickets. */
export type StaffRole = "super_admin" | "moderator" | "support";
export interface Staff { id: string; person_id: string; role: StaffRole; added_by: string | null; created_at: string }

export interface SupportTicket {
  id: string;
  /** null: sent by someone who couldn't sign in. */
  person_id: string | null;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  category: "sign_in" | "payments" | "safety" | "chats_calls" | "dating" | "account" | "bug" | "other";
  subject: string;
  status: "open" | "waiting" | "resolved";
  priority: "normal" | "urgent";
  assignee_id: string | null;
  device_info: string | null;
  unread_user: boolean;
  unread_team: boolean;
  created_at: string;
  updated_at: string;
}
export interface SupportMessage { id: string; ticket_id: string; from_team: boolean; author_id: string | null; body: string; attachment_path: string | null; created_at: string }

/** Every staff action, for accountability. */
export interface AdminAudit { id: string; actor_id: string; action: string; target_type: string; target_id: string | null; details: string; created_at: string }

/** A banner shown to everyone in the app (maintenance, known problems, news). */
export interface Announcement { id: string; text: string; kind: "info" | "warning"; active: boolean; created_by: string; created_at: string; ends_at: string | null }

export interface StatusView { id: string; status_id: string; person_id: string; created_at: string }

export type CallState = "ringing" | "active" | "ended";
export type CallEndReason = "ended" | "declined" | "no_answer" | "cancelled";

export interface Call {
  id: string;
  chat_id: string;
  kind: "voice" | "video";
  started_by: string;
  state: CallState;
  invited: string[];
  participants: string[]; // in the call right now
  joined_ever: string[];
  declined: string[];
  presence: Record<string, string>; // person -> last check-in (ISO)
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: CallEndReason | null;
}

export interface CallSignal {
  id: string;
  call_id: string;
  from_id: string;
  to_id: string;
  type: "offer" | "answer" | "ice" | "bye";
  payload: string;
  created_at: string;
}

export interface AndroidDevice {
  id: string;
  token: string;
  person_id: string;
  app_version: number | null;
  updated_at: string;
}

/** A sign-in text waiting for Afriheart's own gateway phone to send it (OTP sender "phone"). */
export interface SmsOutbox {
  id: string;
  phone: string; // digits only, international (e.g. 27821234567)
  body: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  reason: string | null;
  created_at: string;
  claimed_at: string | null;
  sent_at: string | null;
}

/** A sign-in waiting for the person's WhatsApp message (free alternative to an SMS code). */
export interface WaSignin {
  id: string;
  phone: string;
  code: string; // shown on screen and typed into WhatsApp: not a secret on its own
  browser_hash: string; // sha256 of a cookie only the starting browser has
  ip: string;
  status: "pending" | "confirmed" | "mismatch" | "hidden" | "expired" | "used";
  hint: string | null; // last 4 digits of the number it actually came from (mismatch)
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
}

export interface PhoneCode {
  id: string;
  phone: string;
  code_hash: string;
  ip: string;
  attempts: number;
  consumed: boolean;
  expires_at: string;
  created_at: string;
}

/** A phone or browser with its own encryption keys. Private keys never leave it. */
export interface Device {
  id: string;
  person_id: string;
  enc_pub: string; // ECDH P-256 public key, base64 raw
  sig_pub: string; // ECDSA P-256 public key, base64 raw
  label: string;
  created_at: string;
  revoked_at: string | null;
}

export type Gender = "woman" | "man" | "nonbinary";
export type Seeking = "women" | "men" | "nonbinary";

export interface DatingProfile {
  id: string; // = person id
  person_id: string;
  display_name: string;
  birthdate: string; // YYYY-MM-DD
  gender: Gender;
  interested_in: Seeking[];
  age_min: number;
  age_max: number;
  area: string;
  bio: string;
  photos: string[]; // storage paths, first is the main photo
  date_idea: string;
  date_idea_category: Category | null;
  paused: boolean;
  /** Compatibility answers by question id (see compatibility.ts). Never shown to others as-is. */
  answers?: Record<string, { a: string; ok: string[]; imp: 0 | 1 | 2 | 3 }>;
  /** Up to three answered prompts (see prompts.ts). */
  prompts?: { id: string; answer: string }[];
  /** An optional voice prompt: a short recording answering one prompt. */
  voice_path?: string | null;
  voice_ms?: number | null;
  voice_prompt?: string | null;
  /** Approximate location, rounded to about 1 km on the server. Never shown to anyone. */
  lat?: number | null;
  lng?: number | null;
  /** How far away people can be, in km. 0 = anywhere. */
  max_km?: number;
  /** Set when the team confirmed a live selfie matches the photos. */
  verified_at?: string | null;
  /** Only show (and be shown to) verified people. Only works once you're verified yourself. */
  verified_only?: boolean;
  /** Removed from dating by the team after a review. */
  removed_at?: string | null;
  consent_at: string; // POPIA: explicit consent to use dating preferences
  created_at: string;
  updated_at: string;
}

export interface Swipe {
  id: string;
  from_id: string;
  to_id: string;
  action: "like" | "pass" | "date";
  /** What they liked: "photo:<path>", "prompt:<id>" or "voice". Null = the whole profile. */
  target?: string | null;
  /** An optional comment sent with the like (shown before matching, so not end-to-end encrypted). */
  comment?: string | null;
  created_at: string;
}

export interface Match {
  id: string;
  a: string;
  b: string;
  chat_id: string;
  via: "like" | "date";
  created_at: string;
  ended_at: string | null;
  ended_by: string | null;
}

export interface Block {
  id: string;
  blocker: string;
  blocked: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter: string;
  reported: string;
  reason: "fake" | "scam" | "harassment" | "underage" | "inappropriate" | "safety" | "other";
  details: string;
  created_at: string;
  status: "open" | "reviewed";
  /** What the team did, once reviewed. */
  outcome?: "no_action" | "removed" | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

/** One letter of a couple's alphabet date ideas album. Rows exist only once someone changes a letter. */
export interface AzDate {
  id: string;
  chat_id: string;
  letter: string; // "A".."Z"
  activity: string;
  status: "idea" | "planned" | "done";
  plan_slug: string | null;
  /** The end-to-end encrypted photo message in the chat. The server never sees the photo. */
  message_id: string | null;
  /** The end-to-end encrypted story and rating for this page, also a chat message. */
  story_message_id: string | null;
  done_at: string | null;
  updated_by: string;
  updated_at: string;
}

/**
 * A selfie verification. The selfie is biometric (POPIA special personal
 * information): it's only seen by the Afriheart team and deleted once checked.
 */
export interface Verification {
  id: string;
  person_id: string;
  gesture: string;
  /** started: pose given, no selfie yet; pending: waiting for the team. */
  status: "started" | "pending" | "approved" | "rejected";
  selfie_path: string | null;
  reason: string | null;
  consent_at: string | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

/** A couple's album settings, one per chat (id = chat id). */
export interface AzAlbum {
  id: string;
  chat_id: string;
  style: "out" | "home" | "free" | "food" | "adventure";
  look: "cream" | "floral" | "midnight" | "sunny";
  updated_by: string;
  updated_at: string;
}

/** The talking-cards game on the table in one chat (id = chat id). */
export interface CardGame {
  id: string;
  chat_id: string;
  deck: "thoughtful" | "playful" | "flirty" | "future";
  seed: number;
  position: number;
  flipped: boolean;
  started_by: string;
  updated_by: string;
  updated_at: string;
}

/** A link someone shares so a friend can vouch for them. id = sha256 of the token in the link. */
export interface VouchInvite {
  id: string;
  person_id: string;
  created_at: string;
  expires_at: string;
}

/** A friend's short note about someone, shown on their dating profile once they approve it. */
export interface Vouch {
  id: string;
  person_id: string;
  friend_id: string;
  friend_name: string;
  relation: "friend" | "sibling" | "cousin" | "colleague" | "classmate";
  text: string;
  status: "pending" | "shown" | "hidden";
  created_at: string;
  decided_at: string | null;
}

/** Couple space settings for a direct chat (id = chat id). */
export interface Couple {
  id: string;
  chat_id: string;
  together_since: string | null;
  updated_by: string;
  updated_at: string;
}

/** One person's end-to-end encrypted answer to the couple question of the day (id = chat:date:person). */
export interface CoupleAnswer {
  id: string;
  chat_id: string;
  date: string;
  person_id: string;
  cipher: string;
  created_at: string;
}

/** Someone who wants to hear when date deals and events open in their city (id = person id). */
export interface DealInterest {
  id: string;
  person_id: string;
  city: string;
  created_at: string;
}

/** A venue that wants to offer Afriheart date deals. */
export interface VenueLead {
  id: string;
  person_id: string;
  venue: string;
  city: string;
  contact: string;
  created_at: string;
}

/** One Afriheart+ pass purchase (id is the m_payment_id sent to the payment provider). */
export interface Payment {
  id: string;
  person_id: string;
  /** intro: the one-time cheaper first month offered when the free trial ends. */
  pass: "week" | "month" | "quarter" | "intro";
  amount_cents: number;
  status: "pending" | "complete" | "failed" | "cancelled" | "refunded";
  provider: "payfast" | "test" | "gift";
  provider_ref: string | null;
  method: string | null;
  created_at: string;
  paid_at: string | null;
}

/** Afriheart+ status (id = person id). */
export interface Membership {
  id: string;
  person_id: string;
  plus_until: string;
  /** When the free trial ends (set once, when it starts). */
  trial_until?: string | null;
  updated_at: string;
}

/** One free trial per phone number (id = SHA-256 of the number), kept even after an account is deleted. */
export interface TrialClaim { id: string; created_at: string }

/** A sign-in session. id is a SHA-256 hash of the random cookie token; the token itself is never stored. */
export interface SessionRow {
  id: string;
  person_id: string;
  device_id: string | null;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** A rate-limit counter: id = "<action>:<who>:<window start>". */
export interface RateLimit {
  id: string;
  count: number;
  expires_at: string;
}

/** Who uploaded a stored file, so only they can use it and it's deleted with their account. id = storage path. */
export interface MediaFile {
  id: string;
  owner_id: string;
  kind: "profile" | "chat" | "selfie" | "status" | "support";
  chat_id: string | null;
  created_at: string;
}

/** A public compatibility quiz someone made to send to a friend or partner. Deleted after 30 days. */
export interface Quiz {
  id: string;
  slug: string;
  name: string;
  answers: Record<string, { a: string; ok: string[]; imp: 0 | 1 | 2 | 3 }>;
  key_hash: string;
  created_at: string;
  expires_at: string;
}

/** Someone's answers to a quiz they were sent. */
export interface QuizResponse {
  id: string;
  quiz_id: string;
  name: string;
  answers: Record<string, { a: string; ok: string[]; imp: 0 | 1 | 2 | 3 }>;
  key_hash: string;
  created_at: string;
}

/** Today's most compatible pick for someone. id = "<person>:<YYYY-MM-DD>". */
export interface DailyPick {
  id: string;
  person_id: string;
  pick_id: string | null;
  date: string;
}

/** A pair of friends double dating. b is null until the friend accepts the invite. */
export interface DuoRow {
  id: string;
  a: string;
  b: string | null;
  code: string;
  idea: string;
  status: "pending" | "active" | "ended";
  created_at: string;
}

export interface DuoSwipe {
  id: string;
  from_duo: string;
  to_duo: string;
  by_person: string;
  action: "like" | "pass";
  created_at: string;
}

export interface DuoMatch {
  id: string;
  duo_a: string;
  duo_b: string;
  chat_id: string;
  created_at: string;
}

/** A private "We met" answer about a match. met null = "not yet" (asked again later). */
export interface WeMet {
  id: string;
  chat_id: string;
  from_id: string;
  about_id: string;
  met: boolean | null;
  again: "yes" | "maybe" | "no" | null;
  as_pictured: boolean | null;
  created_at: string;
}

export interface Tables {
  people: Person;
  plans: Plan;
  plan_options: PlanOption;
  votes: Vote;
  commitments: Commitment;
  checkins: Checkin;
  circles: Circle;
  circle_members: CircleMember;
  companion_actions: CompanionAction;
  memories: Memory;
  guide_items: GuideItem;
  chats: Chat;
  chat_members: ChatMember;
  messages: Message;
  calls: Call;
  call_signals: CallSignal;
  android_devices: AndroidDevice;
  phone_codes: PhoneCode;
  sms_outbox: SmsOutbox;
  wa_signins: WaSignin;
  devices: Device;
  dating_profiles: DatingProfile;
  swipes: Swipe;
  matches: Match;
  blocks: Block;
  reports: Report;
  az_dates: AzDate;
  az_albums: AzAlbum;
  verifications: Verification;
  sessions: SessionRow;
  rate_limits: RateLimit;
  media_files: MediaFile;
  quizzes: Quiz;
  quiz_responses: QuizResponse;
  daily_picks: DailyPick;
  duos: DuoRow;
  duo_swipes: DuoSwipe;
  duo_matches: DuoMatch;
  we_met: WeMet;
  card_games: CardGame;
  vouch_invites: VouchInvite;
  vouches: Vouch;
  couples: Couple;
  couple_answers: CoupleAnswer;
  deal_interest: DealInterest;
  venue_leads: VenueLead;
  payments: Payment;
  memberships: Membership;
  trial_claims: TrialClaim;
  chat_lists: ChatListRow;
  staff: Staff;
  support_tickets: SupportTicket;
  support_messages: SupportMessage;
  admin_audit: AdminAudit;
  announcements: Announcement;
  stars: Star;
  message_hides: MessageHide;
  statuses: StatusUpdate;
  status_views: StatusView;
}

export type TableName = keyof Tables;

/** Everything needed to reason about one plan. */
export interface PlanBundle {
  plan: Plan;
  options: PlanOption[];
  votes: Vote[];
  commitments: Commitment[];
  checkins: Checkin[];
  actions: CompanionAction[];
}

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Food & drinks",
  outdoors: "Beach & outdoors",
  sport: "Sport & fitness",
  events: "Events & nightlife",
  celebrate: "Celebrations",
  other: "Something else",
};
