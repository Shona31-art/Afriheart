-- Security and scale fixes.

-- Sign-in sessions the server can end. id is a SHA-256 hash of the cookie token;
-- the token itself is never stored.
create table public.sessions (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  person_id uuid not null references public.people (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  user_agent text not null default '' check (char_length(user_agent) <= 200),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_person_idx on public.sessions (person_id);
create index sessions_device_idx on public.sessions (device_id) where device_id is not null;

-- Rate-limit counters: "<action>:<who>:<window start>".
create table public.rate_limits (
  id text primary key check (char_length(id) <= 200),
  count integer not null default 0,
  expires_at timestamptz not null
);
create index rate_limits_expiry_idx on public.rate_limits (expires_at);

-- Who uploaded each stored file, so only they can use it and it's deleted with their account.
create table public.media_files (
  id text primary key, -- storage path
  owner_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('profile', 'chat', 'selfie')),
  chat_id uuid references public.chats (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index media_files_owner_idx on public.media_files (owner_id);

-- Discover reads candidates filtered by gender, age and a location box, newest first.
create index dating_profiles_discover_idx on public.dating_profiles (gender, birthdate, updated_at desc)
  where paused = false and removed_at is null;
create index dating_profiles_location_idx on public.dating_profiles (lat, lng) where lat is not null;
-- Finding the profile that owns a photo.
create index dating_profiles_photos_idx on public.dating_profiles using gin (photos);
create index if not exists swipes_from_idx on public.swipes (from_id);
create index if not exists swipes_to_idx on public.swipes (to_id);
create index if not exists messages_sender_idx on public.messages (sender_id);

-- Only the server (service role) reads and writes these tables.
alter table public.sessions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.media_files enable row level security;
