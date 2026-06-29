-- Directed friendly bets: a member can optionally challenge ONE specific member
-- (target_id), who is the only one allowed to accept. With no target it stays
-- open to anyone (unchanged).

alter table public.friendly_bets
  add column if not exists target_id uuid references public.profiles (id) on delete set null;

-- Accept: if the bet names a target, only that member may accept it.
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
     and (b.target_id is null or b.target_id = auth.uid())
     and exists (select 1 from public.matches m where m.id = b.match_id and m.kickoff_utc > now());
  if not found then
    raise exception 'This bet can''t be accepted (already taken, not addressed to you, it''s yours, or the match has started).';
  end if;
end;
$$;
