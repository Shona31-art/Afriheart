-- Afriheart's own SMS gateway: sign-in texts waiting for the gateway phone.
-- The text (with the code) is wiped as soon as the phone reports back; rows go after a day.
create table public.sms_outbox (
  id uuid primary key,
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  body text not null check (char_length(body) <= 480),
  status text not null check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz
);
create index sms_outbox_open_idx on public.sms_outbox (status, created_at) where status in ('queued', 'sending');
alter table public.sms_outbox enable row level security;
