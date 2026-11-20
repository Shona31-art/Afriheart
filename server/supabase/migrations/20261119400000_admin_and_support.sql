-- The super admin side and support: staff roles, bans, support tickets and replies, an audit log
-- of every staff action, and app-wide announcement banners. Only the server (service role) reads
-- and writes these tables.

alter table public.people
  add column banned_at timestamptz,
  add column banned_reason text check (banned_reason is null or char_length(banned_reason) <= 300);

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('pending', 'complete', 'failed', 'cancelled', 'refunded'));
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('payfast', 'test', 'gift'));

alter table public.media_files drop constraint if exists media_files_kind_check;
alter table public.media_files add constraint media_files_kind_check check (kind in ('profile', 'chat', 'selfie', 'status', 'support'));

create table public.staff (
  id uuid primary key references public.people (id) on delete cascade,
  person_id uuid not null unique references public.people (id) on delete cascade,
  role text not null check (role in ('super_admin', 'moderator', 'support')),
  added_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key,
  person_id uuid references public.people (id) on delete set null,
  contact_name text not null check (char_length(contact_name) <= 60),
  contact_phone text not null,
  contact_email text,
  category text not null check (category in ('sign_in', 'payments', 'safety', 'chats_calls', 'dating', 'account', 'bug', 'other')),
  subject text not null check (char_length(subject) <= 120),
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  assignee_id uuid references public.people (id) on delete set null,
  device_info text check (device_info is null or char_length(device_info) <= 600),
  unread_user boolean not null default false,
  unread_team boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_person_idx on public.support_tickets (person_id);
create index support_tickets_status_idx on public.support_tickets (status, updated_at);

create table public.support_messages (
  id uuid primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  from_team boolean not null,
  author_id uuid references public.people (id) on delete set null,
  body text not null check (char_length(body) <= 4000),
  attachment_path text,
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create table public.admin_audit (
  id uuid primary key,
  actor_id uuid not null references public.people (id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  details text not null default '' check (char_length(details) <= 500),
  created_at timestamptz not null default now()
);
create index admin_audit_time_idx on public.admin_audit (created_at desc);

create table public.announcements (
  id uuid primary key,
  text text not null check (char_length(text) between 5 and 240),
  kind text not null check (kind in ('info', 'warning')),
  active boolean not null default true,
  created_by uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

alter table public.staff enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.admin_audit enable row level security;
alter table public.announcements enable row level security;
