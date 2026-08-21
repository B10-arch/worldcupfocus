-- Clear out data left over from the retired team-picking pool.
-- Run in the Supabase SQL editor. Safe and idempotent.
--
-- NOTE: this deliberately does NOT touch public.profiles. Those 46 rows are
-- live user accounts (profiles.id references auth.users). Deleting them leaves
-- accounts that can still sign in but have no profile — which breaks the app
-- for those people, including your own admin login. See the note below.

-- The one leftover pick from the World Cup pool.
delete from public.bets;

-- Season-long picks are retired, so nothing should re-populate it.
select 'bets remaining' as check, count(*) from public.bets;
