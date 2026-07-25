-- Goal events for matches: who scored, who assisted, and when.
-- Powers per-game goal lists and the Top Scorer / Top Assister leaders.
-- (Clean sheets are derived from match scores, so they need no table.)
-- Idempotent — safe to run more than once.

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  kind text not null default 'goal' check (kind in ('goal', 'penalty', 'own_goal')),
  minute int check (minute between 0 and 130),
  scorer text not null,
  assist text,
  created_at timestamptz not null default now()
);

create index if not exists match_events_match_idx on public.match_events (match_id);

alter table public.match_events enable row level security;

-- Everyone signed in can read events.
drop policy if exists match_events_read on public.match_events;
create policy match_events_read on public.match_events
  for select to authenticated using (true);

-- Only admins can add/edit/remove events.
drop policy if exists match_events_write on public.match_events;
create policy match_events_write on public.match_events
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
