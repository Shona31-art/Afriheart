-- Afriheart: initial schema for the Follow-Through Loop.
-- The Next.js server talks to these tables with the service-role key; every access
-- rule lives in src/lib/domain.ts. RLS is enabled with no policies, so the anon and
-- authenticated roles can read and write nothing directly. Add narrow policies only
-- when a client needs direct access (e.g. Realtime on a plan).

create table public.people (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),
  is_guest boolean not null default true,
  home_area text,
  budget text check (budget in ('low', 'mid', 'high')),
  availability text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key,
  name text not null,
  organiser_id uuid not null references public.people (id) on delete cascade,
  category text not null check (category in ('food', 'outdoors', 'sport', 'events', 'celebrate', 'other')),
  created_at timestamptz not null default now()
);
create index circles_organiser_idx on public.circles (organiser_id);

create table public.circle_members (
  id uuid primary key,
  circle_id uuid not null references public.circles (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (circle_id, person_id)
);
create index circle_members_person_idx on public.circle_members (person_id);

create table public.plans (
  id uuid primary key,
  slug text not null unique,
  organiser_id uuid not null references public.people (id) on delete cascade,
  circle_id uuid references public.circles (id) on delete set null,
  title text not null,
  spark text not null,
  category text not null check (category in ('food', 'outdoors', 'sport', 'events', 'celebrate', 'other')),
  state text not null default 'shaping' check (state in ('shaping', 'deciding', 'locked', 'done', 'dropped')),
  min_people integer not null default 2 check (min_people >= 1),
  decision_deadline timestamptz,
  locked_option_id uuid,
  ai_source text not null check (ai_source in ('gemini', 'offline')),
  ai_reasoning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plans_organiser_idx on public.plans (organiser_id);
create index plans_circle_idx on public.plans (circle_id);
create index plans_open_deadline_idx on public.plans (decision_deadline) where state = 'deciding';

create table public.plan_options (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  what text not null,
  where_name text not null,
  starts_at timestamptz not null,
  est_cost_per_person integer check (est_cost_per_person >= 0),
  note text,
  source text not null check (source in ('companion', 'person')),
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now()
);
create index plan_options_plan_idx on public.plan_options (plan_id);

alter table public.plans
  add constraint plans_locked_option_fk foreign key (locked_option_id) references public.plan_options (id) on delete set null;

create table public.votes (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  option_id uuid not null references public.plan_options (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, person_id)
);
create index votes_plan_idx on public.votes (plan_id);

create table public.commitments (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  response text not null check (response in ('in', 'maybe', 'out')),
  updated_at timestamptz not null default now(),
  unique (plan_id, person_id)
);
create index commitments_person_idx on public.commitments (person_id, response);

create table public.checkins (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  again boolean,
  created_at timestamptz not null default now(),
  unique (plan_id, person_id)
);

create table public.companion_actions (
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  kind text not null check (kind in ('propose', 'poll', 'nudge', 'lock', 'reminder', 'outcome', 'circle')),
  status text not null check (status in ('suggested', 'prepared', 'authorised', 'done', 'failed')),
  summary text not null,
  link text,
  target_person_id uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now()
);
create index companion_actions_plan_idx on public.companion_actions (plan_id);

create table public.memories (
  id uuid primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('profile', 'learned')),
  text text not null check (char_length(text) <= 200),
  evidence text,
  created_at timestamptz not null default now()
);
create index memories_person_idx on public.memories (person_id);

create table public.guide_items (
  id text primary key,
  city text not null,
  name text not null,
  category text not null check (category in ('food', 'outdoors', 'sport', 'events', 'celebrate', 'other')),
  area text not null,
  description text not null,
  best_slots text[] not null default '{}',
  est_cost integer
);

alter table public.people enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.plans enable row level security;
alter table public.plan_options enable row level security;
alter table public.votes enable row level security;
alter table public.commitments enable row level security;
alter table public.checkins enable row level security;
alter table public.companion_actions enable row level security;
alter table public.memories enable row level security;
alter table public.guide_items enable row level security;
