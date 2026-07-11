-- Per-game settlement with opponent confirmation for friendly (side) bets.
-- One party marks a finished bet as settled; the OTHER party must confirm.
-- Idempotent — safe to run more than once.

alter table public.friendly_bets
  add column if not exists settle_requested_by uuid references auth.users (id),
  add column if not exists settled_at timestamptz;

-- A party (proposer or acceptor) marks a locked bet as settled → awaits the
-- opponent's confirmation.
create or replace function public.request_settle_friendly_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  select * into b from friendly_bets where id = p_bet_id;
  if b is null then raise exception 'bet not found'; end if;
  if auth.uid() is null or auth.uid() not in (b.proposer_id, b.acceptor_id) then
    raise exception 'only the two players in this bet can settle it';
  end if;
  if b.status <> 'accepted' or b.acceptor_id is null then
    raise exception 'bet is not locked';
  end if;
  update friendly_bets
    set settle_requested_by = auth.uid(), settled_at = null
    where id = p_bet_id;
end;
$$;

-- The OTHER party confirms → the bet is settled.
create or replace function public.confirm_settle_friendly_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  select * into b from friendly_bets where id = p_bet_id;
  if b is null then raise exception 'bet not found'; end if;
  if auth.uid() is null or auth.uid() not in (b.proposer_id, b.acceptor_id) then
    raise exception 'only the two players in this bet can settle it';
  end if;
  if b.settle_requested_by is null then
    raise exception 'nothing to confirm yet';
  end if;
  if b.settle_requested_by = auth.uid() then
    raise exception 'the other player has to confirm this';
  end if;
  update friendly_bets set settled_at = now() where id = p_bet_id;
end;
$$;

-- Either party can undo a settle request or a confirmed settlement.
create or replace function public.unsettle_friendly_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare b record;
begin
  select * into b from friendly_bets where id = p_bet_id;
  if b is null then raise exception 'bet not found'; end if;
  if auth.uid() is null or auth.uid() not in (b.proposer_id, b.acceptor_id) then
    raise exception 'only the two players in this bet can settle it';
  end if;
  update friendly_bets set settle_requested_by = null, settled_at = null where id = p_bet_id;
end;
$$;

grant execute on function public.request_settle_friendly_bet(uuid) to authenticated;
grant execute on function public.confirm_settle_friendly_bet(uuid) to authenticated;
grant execute on function public.unsettle_friendly_bet(uuid) to authenticated;
