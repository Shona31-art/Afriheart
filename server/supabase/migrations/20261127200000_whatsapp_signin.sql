-- Free sign-in by WhatsApp: the person sends "Afriheart code 123456" to Afriheart's
-- WhatsApp number; Meta's webhook confirms which number it came from. Rows go after a day.
create table public.wa_signins (
  id uuid primary key,
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  code text not null check (code ~ '^[0-9]{6}$'),
  browser_hash text not null,
  ip text not null,
  status text not null check (status in ('pending', 'confirmed', 'mismatch', 'hidden', 'expired', 'used')),
  hint text check (hint is null or hint ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz
);
create index wa_signins_phone_idx on public.wa_signins (phone, created_at desc);
create index wa_signins_ip_idx on public.wa_signins (ip, created_at desc);
create index wa_signins_pending_idx on public.wa_signins (code) where status = 'pending';
alter table public.wa_signins enable row level security;
