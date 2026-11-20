-- WhatsApp-style chat features: replies, reactions, edits, polls and votes (all end-to-end
-- encrypted; the server only sees which message a reaction/edit/vote is about), stars,
-- "delete for me", clear and delete chat, pin/mute/archive/mark unread, disappearing
-- messages, view-once photos, group descriptions, admin-only settings and invite links,
-- online/last seen with privacy settings, chat lists, and 24-hour status updates.
-- (Stickers, GIFs and voice-note waveforms travel inside the encrypted messages: no tables.)

-- People: last seen and privacy.
alter table public.people
  add column last_seen_at timestamptz,
  add column hide_last_seen boolean not null default false,
  add column read_receipts_off boolean not null default false;

-- Chats: group info and settings.
alter table public.chats
  add column description text check (description is null or char_length(description) <= 500),
  add column disappear_secs integer check (disappear_secs is null or disappear_secs in (86400, 604800, 7776000)),
  add column admins_only_send boolean not null default false,
  add column admins_only_info boolean not null default false,
  add column invite_token text unique;

-- My settings for each chat.
alter table public.chat_members
  add column pinned_at timestamptz,
  add column muted_until timestamptz,
  add column archived boolean not null default false,
  add column marked_unread boolean not null default false,
  add column cleared_at timestamptz,
  add column hidden_at timestamptz;

-- Messages: hidden helpers (reaction, edit, poll vote) about another message; expiry; view once.
alter table public.messages
  add column meta text check (meta is null or meta in ('react', 'edit', 'vote')),
  add column target_id uuid references public.messages (id) on delete cascade,
  add column expires_at timestamptz,
  add column opened_by uuid[] not null default '{}';
create index messages_target_idx on public.messages (target_id) where target_id is not null;
create index messages_expires_idx on public.messages (expires_at) where expires_at is not null;

create table public.stars (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (person_id, message_id)
);
create index stars_person_idx on public.stars (person_id);

create table public.message_hides (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  chat_id uuid not null references public.chats (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (person_id, message_id)
);
create index message_hides_person_chat_idx on public.message_hides (person_id, chat_id);

-- Status updates: end-to-end encrypted envelopes, gone after 24 hours.
create table public.statuses (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  cipher text not null check (char_length(cipher) <= 200000),
  media_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index statuses_person_idx on public.statuses (person_id, expires_at);

create table public.status_views (
  id uuid primary key,
  status_id uuid not null references public.statuses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (status_id, person_id)
);

-- "Add to list": each person's own chat lists (Family, Work…), shown as filters.
create table public.chat_lists (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  chat_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index chat_lists_person_idx on public.chat_lists (person_id);

-- Status photos are stored like chat files, in "status-<person id>/…".
alter table public.media_files drop constraint if exists media_files_kind_check;
alter table public.media_files add constraint media_files_kind_check check (kind in ('profile', 'chat', 'selfie', 'status'));

-- Only the server (service role) reads and writes these.
alter table public.stars enable row level security;
alter table public.message_hides enable row level security;
alter table public.statuses enable row level security;
alter table public.status_views enable row level security;
alter table public.chat_lists enable row level security;
