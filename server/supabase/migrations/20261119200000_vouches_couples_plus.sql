-- Friends vouch for you, Couple space, Date deals (coming soon) and Afriheart+ passes.
-- Only the server (service role) reads and writes these tables.

create table public.vouch_invites (
  id text primary key, -- sha256 of the token in the link
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index vouch_invites_person on public.vouch_invites (person_id);

create table public.vouches (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  friend_id uuid not null references public.people (id) on delete cascade,
  friend_name text not null,
  relation text not null check (relation in ('friend', 'sibling', 'cousin', 'colleague', 'classmate')),
  text text not null check (char_length(text) between 10 and 200),
  status text not null default 'pending' check (status in ('pending', 'shown', 'hidden')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (person_id, friend_id)
);
create index vouches_friend on public.vouches (friend_id);

create table public.couples (
  id uuid primary key references public.chats (id) on delete cascade,
  chat_id uuid not null unique references public.chats (id) on delete cascade,
  together_since date,
  updated_by uuid not null references public.people (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Answers are end-to-end encrypted on the phones; the server only stores the sealed envelope.
create table public.couple_answers (
  id text primary key, -- chat:date:person
  chat_id uuid not null references public.chats (id) on delete cascade,
  date date not null,
  person_id uuid not null references public.people (id) on delete cascade,
  cipher text not null check (char_length(cipher) <= 24000),
  created_at timestamptz not null default now()
);
create index couple_answers_chat on public.couple_answers (chat_id, date);
create index couple_answers_person on public.couple_answers (person_id);

create table public.deal_interest (
  id uuid primary key references public.people (id) on delete cascade,
  person_id uuid not null unique references public.people (id) on delete cascade,
  city text not null,
  created_at timestamptz not null default now()
);

create table public.venue_leads (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  venue text not null,
  city text not null,
  contact text not null,
  created_at timestamptz not null default now()
);
create index venue_leads_person on public.venue_leads (person_id);

-- Payment records are kept after an account is deleted (tax and accounting law), unlinked.
create table public.payments (
  id uuid primary key, -- the m_payment_id sent to Payfast
  person_id uuid references public.people (id) on delete set null,
  pass text not null check (pass in ('week', 'month', 'quarter', 'intro')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'complete', 'failed', 'cancelled')),
  provider text not null check (provider in ('payfast', 'test')),
  provider_ref text,
  method text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_person on public.payments (person_id, created_at);

create table public.memberships (
  id uuid primary key references public.people (id) on delete cascade,
  person_id uuid not null unique references public.people (id) on delete cascade,
  plus_until timestamptz not null,
  trial_until timestamptz,
  updated_at timestamptz not null default now()
);

-- One free trial per phone number, even if the account is deleted and made again.
-- id = SHA-256 of the phone number (the number itself isn't kept here).
create table public.trial_claims (
  id text primary key,
  created_at timestamptz not null default now()
);
alter table public.trial_claims enable row level security;

alter table public.vouch_invites enable row level security;
alter table public.vouches enable row level security;
alter table public.couples enable row level security;
alter table public.couple_answers enable row level security;
alter table public.deal_interest enable row level security;
alter table public.venue_leads enable row level security;
alter table public.payments enable row level security;
alter table public.memberships enable row level security;
