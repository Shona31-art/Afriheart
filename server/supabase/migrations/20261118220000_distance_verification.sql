-- Distance matching, photo verification and the team's review queue.

-- Approximate location: rounded to 2 decimals (about 1 km) by the server before
-- it's saved, and never returned to anyone else. Others only see a rough band.
alter table public.dating_profiles
  add column lat numeric(5, 2) check (lat between -90 and 90),
  add column lng numeric(5, 2) check (lng between -180 and 180),
  add column max_km integer not null default 50 check (max_km in (0, 5, 10, 25, 50, 100)),
  add column verified_at timestamptz,
  add column verified_only boolean not null default false,
  add column removed_at timestamptz;

-- Selfie verification. The selfie is biometric information (POPIA s26): it's
-- only ever shown to the Afriheart team and deleted as soon as it's checked, so
-- selfie_path is null on every reviewed row.
create table public.verifications (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  gesture text not null,
  status text not null check (status in ('started', 'pending', 'approved', 'rejected')),
  selfie_path text,
  reason text check (reason in ('not_matching', 'pose', 'unclear', 'face_hidden', 'other')),
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.people (id) on delete set null,
  check (status in ('started', 'pending') or selfie_path is null)
);
create index verifications_pending_idx on public.verifications (submitted_at) where status = 'pending';
create index verifications_person_idx on public.verifications (person_id, created_at desc);

-- What the team decided about a report.
alter table public.reports
  add column outcome text check (outcome in ('no_action', 'removed')),
  add column reviewed_by uuid references public.people (id) on delete set null,
  add column reviewed_at timestamptz;

-- Only the server (service role) reads and writes this table.
alter table public.verifications enable row level security;
