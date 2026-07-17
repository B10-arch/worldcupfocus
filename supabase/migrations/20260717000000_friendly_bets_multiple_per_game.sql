-- Let a member offer as many bets as they like on the same game.
-- Originally friendly_bets allowed only one offer per member per game; drop that
-- limit so several offers (to different people / different stakes) can coexist.
-- Idempotent — safe to run more than once.

alter table public.friendly_bets
  drop constraint if exists friendly_bets_match_id_proposer_id_key;
