-- Afriheart: WhatsApp-style chats, voice notes, photos, built-in calls and the
-- Android app's push addresses. Same rules as the first migration: the server
-- uses the service-role key; RLS is on with no policies, so browsers can't
-- read these tables directly.

create table public.chats (
  id uuid primary key,
  kind text not null check (kind in ('direct', 'group')),
  name text check (name is null or char_length(name) <= 60),
  created_by uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_members (
  id uuid primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  last_read_at timestamptz,
  last_delivered_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (chat_id, person_id)
);
create index chat_members_person_idx on public.chat_members (person_id);

create table public.messages (
  id uuid primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid references public.people (id) on delete set null,
  kind text not null check (kind in ('text', 'image', 'voice', 'plan', 'companion', 'system', 'call')),
  body text not null default '' check (char_length(body) <= 4000),
  media_path text,
  media_ms integer check (media_ms is null or media_ms between 0 and 1800000),
  plan_id uuid references public.plans (id) on delete set null,
  call_id uuid,
  created_at timestamptz not null default now()
);
create index messages_chat_time_idx on public.messages (chat_id, created_at);

alter table public.plans add column chat_id uuid references public.chats (id) on delete set null;
create index plans_chat_idx on public.plans (chat_id);

create table public.calls (
  id uuid primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  kind text not null check (kind in ('voice', 'video')),
  started_by uuid not null references public.people (id) on delete cascade,
  state text not null check (state in ('ringing', 'active', 'ended')),
  invited uuid[] not null default '{}',
  participants uuid[] not null default '{}',
  joined_ever uuid[] not null default '{}',
  declined uuid[] not null default '{}',
  presence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in ('ended', 'declined', 'no_answer', 'cancelled'))
);
create index calls_chat_idx on public.calls (chat_id);
create index calls_live_idx on public.calls (chat_id) where state <> 'ended';

create table public.call_signals (
  id uuid primary key,
  call_id uuid not null references public.calls (id) on delete cascade,
  from_id uuid not null references public.people (id) on delete cascade,
  to_id uuid not null references public.people (id) on delete cascade,
  type text not null check (type in ('offer', 'answer', 'ice', 'bye')),
  payload text not null check (char_length(payload) <= 20000),
  created_at timestamptz not null default now()
);
create index call_signals_inbox_idx on public.call_signals (call_id, to_id, created_at);

create table public.android_devices (
  id uuid primary key,
  token text not null unique,
  person_id uuid not null references public.people (id) on delete cascade,
  app_version integer,
  updated_at timestamptz not null default now()
);
create index android_devices_person_idx on public.android_devices (person_id);

alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.call_signals enable row level security;
alter table public.android_devices enable row level security;

-- Photos and voice notes: a private bucket the server reads and writes.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('chat-media', 'chat-media', false, 10485760)
    on conflict (id) do nothing;
  end if;
end $$;

-- Connection details are only needed while a call is being set up.
-- Optional clean-up (pg_cron): delete from public.call_signals where created_at < now() - interval '1 day';
