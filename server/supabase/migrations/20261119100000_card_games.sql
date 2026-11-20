-- Talking cards: the question card two people have on the table in a chat.
-- Only deck, shuffle seed and position are stored; the questions live in the app.
create table public.card_games (
  id uuid primary key references public.chats (id) on delete cascade,
  chat_id uuid not null unique references public.chats (id) on delete cascade,
  deck text not null check (deck in ('thoughtful', 'playful', 'flirty', 'future')),
  seed integer not null,
  position integer not null default 0 check (position >= 0),
  flipped boolean not null default false,
  started_by uuid not null references public.people (id) on delete cascade,
  updated_by uuid not null references public.people (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Only the server (service role) reads and writes this table.
alter table public.card_games enable row level security;
