-- Friendly peer-to-peer bets on knockout games.
--
-- Flow: a member OFFERS a bet on a match — they pick a team and write a
-- free-text stake (money OR an activity, e.g. "Rs. 500" or "loser buys momo").
-- Anyone else can APPROVE it (they take the other team), which LOCKS it.
-- Each member may offer ONE bet per match, so MULTIPLE members can each have a
-- bet on the same game. Offers/accepts are only allowed before kickoff.

create table if not exists public.friendly_bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  proposer_team_id uuid references public.teams (id) on delete set null,
  acceptor_id uuid references public.profiles (id) on delete set null,
  stake text not null,
  status text not null default 'open' check (status in ('open', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (match_id, proposer_id) -- one offer per member per game
);

alter table public.friendly_bets enable row level security;

-- Everyone signed in can see all bets.
drop policy if exists fb_select on public.friendly_bets;
create policy fb_select on public.friendly_bets for select to authenticated using (true);

-- Offer a bet: must be yourself, open + unaccepted, and only before kickoff.
-- (the UNIQUE match_id constraint guarantees just one bet per game.)
drop policy if exists fb_insert on public.friendly_bets;
create policy fb_insert on public.friendly_bets for insert to authenticated
with check (
  proposer_id = auth.uid()
  and status = 'open'
  and acceptor_id is null
  and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_utc > now())
);

-- Cancel your own bet while it's still open (frees the game for a new offer).
drop policy if exists fb_delete on public.friendly_bets;
create policy fb_delete on public.friendly_bets for delete to authenticated
using (proposer_id = auth.uid() and status = 'open');

-- No direct UPDATE policy: accepting goes through this function so only the
-- right fields change and the lock can't be bypassed.
create or replace function public.accept_friendly_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friendly_bets b
     set acceptor_id = auth.uid(),
         status = 'accepted',
         accepted_at = now()
   where b.id = p_bet_id
     and b.status = 'open'
     and b.proposer_id <> auth.uid()
     and exists (select 1 from public.matches m where m.id = b.match_id and m.kickoff_utc > now());
  if not found then
    raise exception 'This bet can''t be accepted (already taken, it''s yours, or the match has started).';
  end if;
end;
$$;

grant execute on function public.accept_friendly_bet(uuid) to authenticated;
