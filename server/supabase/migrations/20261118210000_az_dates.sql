-- Alphabet date ideas: one album page per letter a couple has changed, planned or done.
-- Photos and stories aren't stored here: message_id and story_message_id point
-- at end-to-end encrypted messages in the chat, which the server can't read.
create table public.az_dates (
  id uuid primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  letter text not null check (letter ~ '^[A-Z]$'),
  activity text not null check (char_length(activity) between 2 and 60),
  status text not null default 'idea' check (status in ('idea', 'planned', 'done')),
  plan_slug text,
  message_id uuid references public.messages (id) on delete set null,
  story_message_id uuid references public.messages (id) on delete set null,
  done_at timestamptz,
  updated_by uuid not null references public.people (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (chat_id, letter)
);

-- The album's date style and design, shared by the two people in the chat.
create table public.az_albums (
  id uuid primary key references public.chats (id) on delete cascade,
  chat_id uuid not null unique references public.chats (id) on delete cascade,
  style text not null default 'out' check (style in ('out', 'home', 'free', 'food', 'adventure')),
  look text not null default 'cream' check (look in ('cream', 'floral', 'midnight', 'sunny')),
  updated_by uuid not null references public.people (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Only the server (service role) reads and writes these tables.
alter table public.az_dates enable row level security;
alter table public.az_albums enable row level security;
