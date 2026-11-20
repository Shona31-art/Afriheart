-- Afriheart: sign-in codes and end-to-end encryption.
-- devices holds only PUBLIC keys; private keys never leave people's phones.
-- messages.cipher holds envelopes the server can't open.

create table public.phone_codes (
  id uuid primary key,
  phone text not null,
  code_hash text not null,          -- HMAC of the code, never the code itself
  ip text not null,
  attempts integer not null default 0,
  consumed boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index phone_codes_phone_idx on public.phone_codes (phone, created_at desc);
create index phone_codes_ip_idx on public.phone_codes (ip, created_at desc);

create table public.devices (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  enc_pub text not null,            -- ECDH P-256 public key
  sig_pub text not null,            -- ECDSA P-256 public key
  label text not null default 'Phone',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index devices_person_idx on public.devices (person_id) where revoked_at is null;

alter table public.messages add column cipher text check (cipher is null or char_length(cipher) <= 200000);
-- People with no device yet when a message was sent; the sender's phone re-sends the key once they have one.
alter table public.messages add column awaiting uuid[] not null default '{}';
alter table public.messages add column updated_at timestamptz;
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'image', 'voice', 'plan', 'companion', 'system', 'call', 'encrypted'));

alter table public.phone_codes enable row level security;
alter table public.devices enable row level security;

-- Optional clean-up (pg_cron): delete from public.phone_codes where created_at < now() - interval '2 days';
