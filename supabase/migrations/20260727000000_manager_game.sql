-- "Manager" game: a player catalogue + each user's squad (buy/sell within a
-- budget). Idempotent — safe to run more than once.

-- Catalogue of Premier League players (seeded from real FPL data, service-role).
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  fpl_id int unique,
  name text not null,
  full_name text,
  club text not null,
  club_short text,
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  price numeric(5, 1) not null default 4.0,
  points int not null default 0,
  crest text,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
drop policy if exists players_read on public.players;
create policy players_read on public.players
  for select to authenticated using (true);
-- (No user-write policy: the catalogue is maintained via the service role.)

-- Each row = one player a user has signed. Budget is derived: a fixed starting
-- budget minus the sum of price_paid.
create table if not exists public.squad_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  price_paid numeric(5, 1) not null,
  created_at timestamptz not null default now(),
  unique (user_id, player_id)
);

create index if not exists squad_players_user_idx on public.squad_players (user_id);

alter table public.squad_players enable row level security;
drop policy if exists squad_own_all on public.squad_players;
create policy squad_own_all on public.squad_players
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
