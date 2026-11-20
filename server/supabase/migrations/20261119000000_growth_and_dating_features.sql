-- Prompts and comment-to-like, voice prompts, today's most compatible,
-- double dates, "We met", and the public compatibility quiz.

-- Prompts (up to three) and an optional voice prompt on dating profiles.
alter table public.dating_profiles
  add column prompts jsonb not null default '[]'::jsonb,
  add column voice_path text,
  add column voice_ms integer check (voice_ms between 0 and 30000),
  add column voice_prompt text;
create index dating_profiles_voice_idx on public.dating_profiles (voice_path) where voice_path is not null;

-- Liking one photo, prompt or the voice prompt, with an optional comment.
alter table public.swipes
  add column target text check (target is null or target ~ '^(photo:profiles/[a-f0-9]{24}\.(jpg|png|webp)|prompt:[a-z_]+|voice)$'),
  add column comment text check (char_length(comment) <= 150);

-- "like" messages open a match chat with what each person liked; "double" chats are double dates.
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'voice', 'plan', 'companion', 'system', 'call', 'encrypted', 'like'));
alter table public.chats drop constraint chats_origin_check;
alter table public.chats add constraint chats_origin_check check (origin in ('contacts', 'match', 'double'));

-- Today's most compatible: one pick per person per day.
create table public.daily_picks (
  id text primary key, -- "<person id>:<YYYY-MM-DD>"
  person_id uuid not null references public.people (id) on delete cascade,
  pick_id uuid references public.people (id) on delete set null,
  date date not null
);
create index daily_picks_person_idx on public.daily_picks (person_id, date);

-- Double dates: pairs of friends, their likes, and their matches.
create table public.duos (
  id uuid primary key,
  a uuid not null references public.people (id) on delete cascade,
  b uuid references public.people (id) on delete cascade,
  code text not null unique,
  idea text not null check (char_length(idea) between 4 and 120),
  status text not null check (status in ('pending', 'active', 'ended')),
  created_at timestamptz not null default now()
);
create index duos_a_idx on public.duos (a) where status <> 'ended';
create index duos_b_idx on public.duos (b) where status <> 'ended';
create index duos_active_idx on public.duos (created_at desc) where status = 'active';

create table public.duo_swipes (
  id uuid primary key,
  from_duo uuid not null references public.duos (id) on delete cascade,
  to_duo uuid not null references public.duos (id) on delete cascade,
  by_person uuid not null references public.people (id) on delete cascade,
  action text not null check (action in ('like', 'pass')),
  created_at timestamptz not null default now(),
  unique (from_duo, to_duo)
);
create index duo_swipes_to_idx on public.duo_swipes (to_duo);

create table public.duo_matches (
  id uuid primary key,
  duo_a uuid not null references public.duos (id) on delete cascade,
  duo_b uuid not null references public.duos (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- "We met": private answers after a planned date.
create table public.we_met (
  id uuid primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  from_id uuid not null references public.people (id) on delete cascade,
  about_id uuid not null references public.people (id) on delete cascade,
  met boolean, -- null = "not yet"
  again text check (again in ('yes', 'maybe', 'no')),
  as_pictured boolean,
  created_at timestamptz not null default now()
);
create index we_met_chat_idx on public.we_met (chat_id, from_id);

-- The public compatibility quiz (no account). Deleted after 30 days.
create table public.quizzes (
  id uuid primary key,
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 30),
  answers jsonb not null,
  key_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index quizzes_expiry_idx on public.quizzes (expires_at);

create table public.quiz_responses (
  id uuid primary key,
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  answers jsonb not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index quiz_responses_quiz_idx on public.quiz_responses (quiz_id);

-- Only the server (service role) reads and writes these tables.
alter table public.daily_picks enable row level security;
alter table public.duos enable row level security;
alter table public.duo_swipes enable row level security;
alter table public.duo_matches enable row level security;
alter table public.we_met enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_responses enable row level security;
