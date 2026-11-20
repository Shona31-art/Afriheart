-- Compatibility answers, stored with the dating profile. Only ever read by the
-- server to compute scores; never returned to other people as-is.
alter table public.dating_profiles add column answers jsonb not null default '{}'::jsonb;
