-- Fantasy pool for the 2026/27 Premier League season: nine manager entries,
-- their points per matchweek, and (derived) the winner of each matchweek.
--
-- Standings are public: readable by anyone, writable only by admins.
-- Idempotent — safe to run more than once.

-- One row per entry in the pool.
create table if not exists public.pool_entries (
  id uuid primary key default gen_random_uuid(),
  team_name text not null unique,
  manager_name text not null,
  created_at timestamptz not null default now()
);

-- Points an entry scored in a given matchweek. One row per entry per week.
create table if not exists public.pool_gw_scores (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.pool_entries (id) on delete cascade,
  gameweek int not null check (gameweek between 1 and 38),
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, gameweek)
);

create index if not exists pool_gw_scores_gw_idx on public.pool_gw_scores (gameweek);

alter table public.pool_entries  enable row level security;
alter table public.pool_gw_scores enable row level security;

-- Visible to everyone, signed in or not.
drop policy if exists pool_entries_read on public.pool_entries;
create policy pool_entries_read on public.pool_entries
  for select to anon, authenticated using (true);

drop policy if exists pool_gw_scores_read on public.pool_gw_scores;
create policy pool_gw_scores_read on public.pool_gw_scores
  for select to anon, authenticated using (true);

-- Only admins can change entries or enter points.
drop policy if exists pool_entries_write on public.pool_entries;
create policy pool_entries_write on public.pool_entries
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists pool_gw_scores_write on public.pool_gw_scores;
create policy pool_gw_scores_write on public.pool_gw_scores
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- The nine entries. Re-running refreshes the manager name without touching
-- any points already recorded against the entry.
insert into public.pool_entries (team_name, manager_name) values
  ('Baklol 11',        'Bikash Neupane'),
  ('Classic Surya',    'Manoj Kafle'),
  ('Gareeb Bhosdemon', 'Rahul Roy'),
  ('XIChutiyas',       'manish baral'),
  ('Reece’s Pieces',   'Sushant Maskey'),
  ('Shamdhini FC',     'Hemant Chhangchha Rai'),
  ('Flo',              'Sonu Dongol'),
  ('LaudaLasun',       'First From The Last'),
  ('Mingbu''s Team',   'Mingbu Rai')
on conflict (team_name) do update set manager_name = excluded.manager_name;
