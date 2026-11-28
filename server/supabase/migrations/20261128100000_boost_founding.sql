-- Afriheart+ boost (shown first in Discover until boosted_until) and founding members.
alter table public.dating_profiles add column boosted_until timestamptz;
alter table public.memberships add column founding boolean not null default false;
create index memberships_founding_idx on public.memberships (founding) where founding;
