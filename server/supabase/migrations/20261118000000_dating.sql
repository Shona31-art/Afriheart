-- Afriheart dating: profiles, likes, matches, blocks and reports.
-- Dating preferences (who someone is interested in) are special personal
-- information under POPIA: consent_at records the person's explicit consent.

alter table public.chats add column origin text not null default 'contacts' check (origin in ('contacts', 'match'));

create table public.dating_profiles (
  id uuid primary key references public.people (id) on delete cascade,
  person_id uuid not null unique references public.people (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  birthdate date not null check (birthdate <= (current_date - interval '18 years')),
  gender text not null check (gender in ('woman', 'man', 'nonbinary')),
  interested_in text[] not null check (array_length(interested_in, 1) >= 1),
  age_min integer not null check (age_min >= 18),
  age_max integer not null check (age_max <= 100 and age_max >= age_min),
  area text not null default '',
  bio text not null default '' check (char_length(bio) <= 300),
  photos text[] not null check (array_length(photos, 1) between 1 and 6),
  date_idea text not null check (char_length(date_idea) between 4 and 120),
  date_idea_category text,
  paused boolean not null default false,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dating_profiles_active_idx on public.dating_profiles (updated_at desc) where not paused;

create table public.swipes (
  id uuid primary key,
  from_id uuid not null references public.people (id) on delete cascade,
  to_id uuid not null references public.people (id) on delete cascade,
  action text not null check (action in ('like', 'pass', 'date')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);
create index swipes_to_idx on public.swipes (to_id);

create table public.matches (
  id uuid primary key,
  a uuid not null references public.people (id) on delete cascade,
  b uuid not null references public.people (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  via text not null check (via in ('like', 'date')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.people (id) on delete set null
);
create index matches_a_idx on public.matches (a);
create index matches_b_idx on public.matches (b);
create index matches_chat_idx on public.matches (chat_id);

create table public.blocks (
  id uuid primary key,
  blocker uuid not null references public.people (id) on delete cascade,
  blocked uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker, blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

create table public.reports (
  id uuid primary key,
  reporter uuid not null references public.people (id) on delete cascade,
  reported uuid not null references public.people (id) on delete cascade,
  reason text not null check (reason in ('fake', 'scam', 'harassment', 'underage', 'inappropriate', 'safety', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'reviewed'))
);
create index reports_open_idx on public.reports (created_at) where status = 'open';

alter table public.dating_profiles enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
