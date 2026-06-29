-- Reject + edit for friendly bets.
--   * a 'rejected' status (a challenged member can decline)
--   * proposer can edit their own still-open bet (team / stake / target)
--   * proposer can remove their own open OR rejected bet (to re-offer)

alter table public.friendly_bets drop constraint if exists friendly_bets_status_check;
alter table public.friendly_bets
  add constraint friendly_bets_status_check check (status in ('open', 'accepted', 'rejected'));

-- Proposer edits their own open bet.
drop policy if exists fb_update on public.friendly_bets;
create policy fb_update on public.friendly_bets for update to authenticated
using (proposer_id = auth.uid() and status = 'open')
with check (proposer_id = auth.uid() and status = 'open' and acceptor_id is null);

-- Proposer removes their own open/rejected bet (open is already allowed; widen it).
drop policy if exists fb_delete on public.friendly_bets;
create policy fb_delete on public.friendly_bets for delete to authenticated
using (proposer_id = auth.uid() and status in ('open', 'rejected'));

-- The challenged member declines a directed bet.
create or replace function public.reject_friendly_bet(p_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friendly_bets b
     set status = 'rejected'
   where b.id = p_bet_id and b.status = 'open' and b.target_id = auth.uid();
  if not found then
    raise exception 'You can''t reject this bet (not addressed to you, or it''s no longer open).';
  end if;
end;
$$;

grant execute on function public.reject_friendly_bet(uuid) to authenticated;
