-- Support every English competition (Premier League, Community Shield, FA Cup)
-- in the `matches` table, not just the league.
--
-- Idempotent — safe to paste into the Supabase SQL editor more than once.

-- 1. Stable key from the ESPN feed, so fixture/score syncs update rows in place
--    instead of duplicating them. Nullable: hand-created rows are still valid.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS espn_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS matches_espn_event_id_key
  ON public.matches (espn_event_id)
  WHERE espn_event_id IS NOT NULL;

-- Cup fixtures are looked up by competition + date on every page load.
CREATE INDEX IF NOT EXISTS matches_stage_kickoff_idx
  ON public.matches (stage, kickoff_utc);

-- 2. Keep pool scoring Premier-League-only.
--
--    recompute_points previously summed EVERY finished match for a backed team.
--    Now that Community Shield and FA Cup results live in the same table, that
--    would hand out pool points for cup wins. Restrict it to stage = 'league'.
--
--    Scoring rule (unchanged otherwise): 3 per win, 1 per draw, 0 per loss,
--    summed across the team's finished league matches.
CREATE OR REPLACE FUNCTION public.recompute_points()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH team_pts AS (
    SELECT
      t.id AS team_id,
      COALESCE(SUM(
        CASE
          WHEN m.winner_team_id = t.id THEN 3                       -- won (incl. pens)
          WHEN m.winner_team_id IS NOT NULL THEN 0                  -- other team won
          WHEN m.score_a IS NULL OR m.score_b IS NULL THEN 0
          WHEN m.score_a = m.score_b THEN 1                         -- draw
          WHEN (t.id = m.team_a_id AND m.score_a > m.score_b)
            OR (t.id = m.team_b_id AND m.score_b > m.score_a) THEN 3 -- won on score
          ELSE 0
        END
      ), 0)::int AS pts
    FROM public.teams t
    LEFT JOIN public.matches m
      ON (m.team_a_id = t.id OR m.team_b_id = t.id)
     AND m.status = 'finished'
     AND m.stage = 'league'                                          -- league only
    GROUP BY t.id
  )
  UPDATE public.bets b
  SET points = tp.pts
  FROM team_pts tp
  WHERE tp.team_id = b.team_id
    AND b.points IS DISTINCT FROM tp.pts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recompute_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_points() TO service_role, authenticated;

-- 3. Weekly fixture refresh, so newly published FA Cup rounds appear on their
--    own. Mirrors the sync-matches schedule; secret read from Vault.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-fixtures');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-fixtures',
  '17 4 * * 1',  -- Mondays, 04:17 UTC
  $$
  SELECT net.http_post(
    url := 'https://wticnahezjugepbyzlaq.supabase.co/functions/v1/sync-fixtures',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_matches_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
