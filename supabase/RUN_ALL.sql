-- ============================================================
-- RUN ALL OF THIS IN THE SUPABASE SQL EDITOR, TOP TO BOTTOM.
-- Every section is idempotent — re-running is safe.
-- Section 2 depends on section 1, so keep the order.
-- ============================================================


-- ============================================================
-- 1/4  Competitions + espn_event_id  (adds the column everything else needs)
-- source: supabase/migrations/20260816000000_all_competitions.sql
-- ============================================================
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


-- ============================================================
-- 2/4  Fixture load  (380 PL + Community Shield)
-- source: supabase/seed_fixtures_2026_27.sql
-- ============================================================
-- Full fixture load: Premier League 2026/27 (all 380 fixtures) + the 2026
-- Community Shield. The FA Cup rounds that involve Premier League clubs are not
-- published by the feed until the winter — the sync-fixtures edge function picks
-- them up automatically once they are.
-- Source: ESPN public scoreboard feed. Idempotent — safe to re-run.
-- REQUIRES 20260816000000_all_competitions.sql to have been run first
-- (it adds matches.espn_event_id and its unique index).

BEGIN;

CREATE TEMP TABLE _fx (
  espn_event_id text PRIMARY KEY,
  home_code text, away_code text,
  kickoff_utc timestamptz, stage text, group_name text, venue text
) ON COMMIT DROP;

INSERT INTO _fx (espn_event_id, home_code, away_code, kickoff_utc, stage, group_name, venue) VALUES
  ('401879301', 'ARS', 'COV', '2026-08-21T19:00:00+00:00'::timestamptz, 'league', 'GW1', 'Emirates Stadium'),
  ('401879322', 'HUL', 'MUN', '2026-08-22T11:30:00+00:00'::timestamptz, 'league', 'GW1', 'The MKM Stadium'),
  ('401879300', 'EVE', 'CRY', '2026-08-22T14:00:00+00:00'::timestamptz, 'league', 'GW1', 'Hill Dickinson Stadium'),
  ('401879299', 'IPS', 'SUN', '2026-08-22T14:00:00+00:00'::timestamptz, 'league', 'GW1', 'Portman Road'),
  ('401879298', 'NFO', 'LEE', '2026-08-22T14:00:00+00:00'::timestamptz, 'league', 'GW1', 'The City Ground'),
  ('401879321', 'BRE', 'TOT', '2026-08-22T16:30:00+00:00'::timestamptz, 'league', 'GW1', 'Gtech Community Stadium'),
  ('401879297', 'BHA', 'AVL', '2026-08-23T13:00:00+00:00'::timestamptz, 'league', 'GW1', 'American Express Stadium'),
  ('401879320', 'MCI', 'BOU', '2026-08-23T13:00:00+00:00'::timestamptz, 'league', 'GW1', 'Etihad Stadium'),
  ('401879319', 'NEW', 'LIV', '2026-08-23T15:30:00+00:00'::timestamptz, 'league', 'GW1', 'St. James'' Park'),
  ('401879318', 'FUL', 'CHE', '2026-08-24T19:00:00+00:00'::timestamptz, 'league', 'GW1', 'Craven Cottage'),
  ('401879294', 'CRY', 'MCI', '2026-08-28T19:00:00+00:00'::timestamptz, 'league', 'GW2', 'Selhurst Park'),
  ('401879314', 'LIV', 'NFO', '2026-08-29T11:30:00+00:00'::timestamptz, 'league', 'GW2', 'Anfield'),
  ('401879296', 'BOU', 'EVE', '2026-08-29T14:00:00+00:00'::timestamptz, 'league', 'GW2', 'Vitality Stadium'),
  ('401879316', 'COV', 'HUL', '2026-08-29T14:00:00+00:00'::timestamptz, 'league', 'GW2', 'Coventry Building Society Arena'),
  ('401879312', 'TOT', 'NEW', '2026-08-29T16:30:00+00:00'::timestamptz, 'league', 'GW2', 'Tottenham Hotspur Stadium'),
  ('401879317', 'CHE', 'BHA', '2026-08-30T13:00:00+00:00'::timestamptz, 'league', 'GW2', 'Stamford Bridge'),
  ('401879315', 'LEE', 'BRE', '2026-08-30T13:00:00+00:00'::timestamptz, 'league', 'GW2', 'Elland Road'),
  ('401879313', 'SUN', 'FUL', '2026-08-30T13:00:00+00:00'::timestamptz, 'league', 'GW2', 'Stadium of Light'),
  ('401879293', 'MUN', 'IPS', '2026-08-30T15:30:00+00:00'::timestamptz, 'league', 'GW2', 'Old Trafford'),
  ('401879295', 'AVL', 'ARS', '2026-08-31T19:00:00+00:00'::timestamptz, 'league', 'GW2', 'Villa Park'),
  ('401879288', 'IPS', 'LIV', '2026-09-04T19:00:00+00:00'::timestamptz, 'league', 'GW3', 'Portman Road'),
  ('401879286', 'NEW', 'BOU', '2026-09-05T11:30:00+00:00'::timestamptz, 'league', 'GW3', 'St. James'' Park'),
  ('401879311', 'BRE', 'SUN', '2026-09-05T14:00:00+00:00'::timestamptz, 'league', 'GW3', 'Gtech Community Stadium'),
  ('401879290', 'BHA', 'LEE', '2026-09-05T14:00:00+00:00'::timestamptz, 'league', 'GW3', 'American Express Stadium'),
  ('401879289', 'FUL', 'CRY', '2026-09-05T14:00:00+00:00'::timestamptz, 'league', 'GW3', 'Craven Cottage'),
  ('401879287', 'MCI', 'COV', '2026-09-05T14:00:00+00:00'::timestamptz, 'league', 'GW3', 'Etihad Stadium'),
  ('401878780', 'NFO', 'TOT', '2026-09-05T14:00:00+00:00'::timestamptz, 'league', 'GW3', 'The City Ground'),
  ('401878781', 'HUL', 'AVL', '2026-09-05T16:30:00+00:00'::timestamptz, 'league', 'GW3', 'The MKM Stadium'),
  ('401879291', 'EVE', 'MUN', '2026-09-06T13:00:00+00:00'::timestamptz, 'league', 'GW3', 'Hill Dickinson Stadium'),
  ('401879292', 'ARS', 'CHE', '2026-09-06T15:30:00+00:00'::timestamptz, 'league', 'GW3', 'Emirates Stadium'),
  ('401879285', 'BOU', 'BRE', '2026-09-12T14:00:00+00:00'::timestamptz, 'league', 'GW4', 'Vitality Stadium'),
  ('401879284', 'AVL', 'NFO', '2026-09-12T14:00:00+00:00'::timestamptz, 'league', 'GW4', 'Villa Park'),
  ('401879283', 'CHE', 'HUL', '2026-09-12T14:00:00+00:00'::timestamptz, 'league', 'GW4', 'Stamford Bridge'),
  ('401879281', 'CRY', 'IPS', '2026-09-12T14:00:00+00:00'::timestamptz, 'league', 'GW4', 'Selhurst Park'),
  ('401879279', 'LIV', 'FUL', '2026-09-12T14:00:00+00:00'::timestamptz, 'league', 'GW4', 'Anfield'),
  ('401879277', 'TOT', 'EVE', '2026-09-12T16:30:00+00:00'::timestamptz, 'league', 'GW4', 'Tottenham Hotspur Stadium'),
  ('401878779', 'SUN', 'ARS', '2026-09-12T19:00:00+00:00'::timestamptz, 'league', 'GW4', 'Stadium of Light'),
  ('401879282', 'COV', 'BHA', '2026-09-13T13:00:00+00:00'::timestamptz, 'league', 'GW4', 'Coventry Building Society Arena'),
  ('401879278', 'MUN', 'MCI', '2026-09-13T15:30:00+00:00'::timestamptz, 'league', 'GW4', 'Old Trafford'),
  ('401879280', 'LEE', 'NEW', '2026-09-14T19:00:00+00:00'::timestamptz, 'league', 'GW4', 'Elland Road'),
  ('401879275', 'BRE', 'CHE', '2026-09-18T19:00:00+00:00'::timestamptz, 'league', 'GW5', 'Gtech Community Stadium'),
  ('401879269', 'TOT', 'AVL', '2026-09-19T11:30:00+00:00'::timestamptz, 'league', 'GW5', 'Tottenham Hotspur Stadium'),
  ('401879274', 'BHA', 'ARS', '2026-09-19T14:00:00+00:00'::timestamptz, 'league', 'GW5', 'American Express Stadium'),
  ('401878778', 'EVE', 'IPS', '2026-09-19T14:00:00+00:00'::timestamptz, 'league', 'GW5', 'Hill Dickinson Stadium'),
  ('401879273', 'LEE', 'CRY', '2026-09-19T14:00:00+00:00'::timestamptz, 'league', 'GW5', 'Elland Road'),
  ('401879272', 'MCI', 'SUN', '2026-09-19T14:00:00+00:00'::timestamptz, 'league', 'GW5', 'Etihad Stadium'),
  ('401879271', 'NEW', 'HUL', '2026-09-19T14:00:00+00:00'::timestamptz, 'league', 'GW5', 'St. James'' Park'),
  ('401879270', 'NFO', 'COV', '2026-09-19T16:30:00+00:00'::timestamptz, 'league', 'GW5', 'The City Ground'),
  ('401879276', 'BOU', 'LIV', '2026-09-20T13:00:00+00:00'::timestamptz, 'league', 'GW5', 'Vitality Stadium'),
  ('401878777', 'FUL', 'MUN', '2026-09-20T15:30:00+00:00'::timestamptz, 'league', 'GW5', 'Craven Cottage'),
  ('401879268', 'ARS', 'LEE', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Emirates Stadium'),
  ('401878776', 'AVL', 'BRE', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Villa Park'),
  ('401878775', 'CHE', 'BOU', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Stamford Bridge'),
  ('401879267', 'COV', 'NEW', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Coventry Building Society Arena'),
  ('401879266', 'CRY', 'NFO', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Selhurst Park'),
  ('401878774', 'HUL', 'EVE', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'The MKM Stadium'),
  ('401879265', 'IPS', 'FUL', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Portman Road'),
  ('401879264', 'LIV', 'MCI', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Anfield'),
  ('401878773', 'MUN', 'TOT', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Old Trafford'),
  ('401878772', 'SUN', 'BHA', '2026-10-10T14:00:00+00:00'::timestamptz, 'league', 'GW6', 'Stadium of Light'),
  ('401879263', 'BOU', 'SUN', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Vitality Stadium'),
  ('401879262', 'BRE', 'LIV', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Gtech Community Stadium'),
  ('401879261', 'BHA', 'CRY', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'American Express Stadium'),
  ('401878771', 'EVE', 'CHE', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Hill Dickinson Stadium'),
  ('401878770', 'FUL', 'HUL', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Craven Cottage'),
  ('401879260', 'LEE', 'MUN', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Elland Road'),
  ('401879259', 'MCI', 'IPS', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Etihad Stadium'),
  ('401879258', 'NEW', 'AVL', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'St. James'' Park'),
  ('401878769', 'NFO', 'ARS', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'The City Ground'),
  ('401879257', 'TOT', 'COV', '2026-10-17T14:00:00+00:00'::timestamptz, 'league', 'GW7', 'Tottenham Hotspur Stadium'),
  ('401878768', 'ARS', 'EVE', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Emirates Stadium'),
  ('401879256', 'AVL', 'MCI', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Villa Park'),
  ('401878767', 'CHE', 'TOT', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Stamford Bridge'),
  ('401879255', 'COV', 'FUL', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Coventry Building Society Arena'),
  ('401879254', 'CRY', 'NEW', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Selhurst Park'),
  ('401878766', 'HUL', 'BRE', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'The MKM Stadium'),
  ('401879253', 'IPS', 'NFO', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Portman Road'),
  ('401878765', 'LIV', 'BHA', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Anfield'),
  ('401879252', 'MUN', 'BOU', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Old Trafford'),
  ('401878764', 'SUN', 'LEE', '2026-10-24T14:00:00+00:00'::timestamptz, 'league', 'GW8', 'Stadium of Light'),
  ('401879251', 'BOU', 'LEE', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Vitality Stadium'),
  ('401879250', 'AVL', 'FUL', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Villa Park'),
  ('401879249', 'BRE', 'NFO', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Gtech Community Stadium'),
  ('401879248', 'CHE', 'MUN', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Stamford Bridge'),
  ('401879247', 'COV', 'SUN', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Coventry Building Society Arena'),
  ('401878763', 'HUL', 'IPS', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'The MKM Stadium'),
  ('401879246', 'LIV', 'ARS', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Anfield'),
  ('401879245', 'MCI', 'BHA', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Etihad Stadium'),
  ('401878762', 'NEW', 'EVE', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'St. James'' Park'),
  ('401878761', 'TOT', 'CRY', '2026-10-31T15:00:00+00:00'::timestamptz, 'league', 'GW9', 'Tottenham Hotspur Stadium'),
  ('401878760', 'ARS', 'HUL', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Emirates Stadium'),
  ('401879244', 'BHA', 'BRE', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'American Express Stadium'),
  ('401879243', 'CRY', 'LIV', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Selhurst Park'),
  ('401879242', 'EVE', 'COV', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Hill Dickinson Stadium'),
  ('401879241', 'FUL', 'NEW', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Craven Cottage'),
  ('401878759', 'IPS', 'BOU', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Portman Road'),
  ('401878758', 'LEE', 'TOT', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Elland Road'),
  ('401879240', 'MUN', 'AVL', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Old Trafford'),
  ('401878757', 'NFO', 'MCI', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'The City Ground'),
  ('401879239', 'SUN', 'CHE', '2026-11-07T15:00:00+00:00'::timestamptz, 'league', 'GW10', 'Stadium of Light'),
  ('401879238', 'BOU', 'NFO', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Vitality Stadium'),
  ('401878756', 'AVL', 'SUN', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Villa Park'),
  ('401879237', 'BRE', 'EVE', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Gtech Community Stadium'),
  ('401879236', 'CHE', 'LEE', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Stamford Bridge'),
  ('401879235', 'COV', 'CRY', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Coventry Building Society Arena'),
  ('401879234', 'HUL', 'BHA', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'The MKM Stadium'),
  ('401878755', 'LIV', 'MUN', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Anfield'),
  ('401879233', 'MCI', 'FUL', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Etihad Stadium'),
  ('401879232', 'NEW', 'ARS', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'St. James'' Park'),
  ('401878754', 'TOT', 'IPS', '2026-11-21T15:00:00+00:00'::timestamptz, 'league', 'GW11', 'Tottenham Hotspur Stadium'),
  ('401878753', 'ARS', 'MCI', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Emirates Stadium'),
  ('401879231', 'BHA', 'NEW', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'American Express Stadium'),
  ('401879230', 'CRY', 'HUL', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Selhurst Park'),
  ('401879229', 'EVE', 'LIV', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Hill Dickinson Stadium'),
  ('401879228', 'FUL', 'BOU', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Craven Cottage'),
  ('401878752', 'IPS', 'AVL', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Portman Road'),
  ('401879227', 'LEE', 'COV', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Elland Road'),
  ('401879226', 'MUN', 'BRE', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Old Trafford'),
  ('401879225', 'NFO', 'CHE', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'The City Ground'),
  ('401879224', 'SUN', 'TOT', '2026-11-28T15:00:00+00:00'::timestamptz, 'league', 'GW12', 'Stadium of Light'),
  ('401879223', 'BOU', 'BHA', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Vitality Stadium'),
  ('401878751', 'AVL', 'EVE', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Villa Park'),
  ('401878750', 'BRE', 'ARS', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Gtech Community Stadium'),
  ('401879222', 'CHE', 'CRY', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Stamford Bridge'),
  ('401879221', 'COV', 'IPS', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Coventry Building Society Arena'),
  ('401879220', 'HUL', 'NFO', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'The MKM Stadium'),
  ('401879219', 'LIV', 'SUN', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Anfield'),
  ('401879218', 'MCI', 'LEE', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Etihad Stadium'),
  ('401879217', 'NEW', 'MUN', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'St. James'' Park'),
  ('401878749', 'TOT', 'FUL', '2026-12-02T20:00:00+00:00'::timestamptz, 'league', 'GW13', 'Tottenham Hotspur Stadium'),
  ('401879216', 'BOU', 'HUL', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Vitality Stadium'),
  ('401879215', 'AVL', 'CRY', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Villa Park'),
  ('401879214', 'BRE', 'MCI', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Gtech Community Stadium'),
  ('401879213', 'CHE', 'LIV', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Stamford Bridge'),
  ('401879212', 'EVE', 'FUL', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Hill Dickinson Stadium'),
  ('401879211', 'LEE', 'IPS', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Elland Road'),
  ('401879210', 'MUN', 'COV', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Old Trafford'),
  ('401878748', 'NEW', 'SUN', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'St. James'' Park'),
  ('401878747', 'NFO', 'BHA', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'The City Ground'),
  ('401879209', 'TOT', 'ARS', '2026-12-05T15:00:00+00:00'::timestamptz, 'league', 'GW14', 'Tottenham Hotspur Stadium'),
  ('401878746', 'ARS', 'BOU', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Emirates Stadium'),
  ('401878745', 'BHA', 'EVE', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'American Express Stadium'),
  ('401879208', 'COV', 'AVL', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Coventry Building Society Arena'),
  ('401879207', 'CRY', 'MUN', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Selhurst Park'),
  ('401879206', 'FUL', 'BRE', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Craven Cottage'),
  ('401879205', 'HUL', 'TOT', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'The MKM Stadium'),
  ('401878744', 'IPS', 'NEW', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Portman Road'),
  ('401878743', 'LIV', 'LEE', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Anfield'),
  ('401878742', 'MCI', 'CHE', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Etihad Stadium'),
  ('401878741', 'SUN', 'NFO', '2026-12-12T15:00:00+00:00'::timestamptz, 'league', 'GW15', 'Stadium of Light'),
  ('401878740', 'BOU', 'COV', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Vitality Stadium'),
  ('401879204', 'ARS', 'MUN', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Emirates Stadium'),
  ('401879203', 'BRE', 'NEW', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Gtech Community Stadium'),
  ('401878739', 'BHA', 'IPS', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'American Express Stadium'),
  ('401879202', 'CHE', 'AVL', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Stamford Bridge'),
  ('401879201', 'LEE', 'FUL', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Elland Road'),
  ('401879200', 'LIV', 'TOT', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Anfield'),
  ('401879199', 'MCI', 'HUL', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Etihad Stadium'),
  ('401879198', 'NFO', 'EVE', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'The City Ground'),
  ('401878738', 'SUN', 'CRY', '2026-12-19T15:00:00+00:00'::timestamptz, 'league', 'GW16', 'Stadium of Light'),
  ('401878737', 'AVL', 'LEE', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Villa Park'),
  ('401878736', 'COV', 'CHE', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Coventry Building Society Arena'),
  ('401878735', 'CRY', 'ARS', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Selhurst Park'),
  ('401879197', 'EVE', 'SUN', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Hill Dickinson Stadium'),
  ('401878734', 'FUL', 'BHA', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Craven Cottage'),
  ('401878733', 'HUL', 'LIV', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'The MKM Stadium'),
  ('401879196', 'IPS', 'BRE', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Portman Road'),
  ('401879195', 'MUN', 'NFO', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Old Trafford'),
  ('401878732', 'NEW', 'MCI', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'St. James'' Park'),
  ('401878731', 'TOT', 'BOU', '2026-12-26T15:00:00+00:00'::timestamptz, 'league', 'GW17', 'Tottenham Hotspur Stadium'),
  ('401879194', 'AVL', 'LIV', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Villa Park'),
  ('401878730', 'COV', 'BRE', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Coventry Building Society Arena'),
  ('401879193', 'CRY', 'BOU', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Selhurst Park'),
  ('401879192', 'EVE', 'MCI', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Hill Dickinson Stadium'),
  ('401879191', 'FUL', 'ARS', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Craven Cottage'),
  ('401879190', 'HUL', 'LEE', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'The MKM Stadium'),
  ('401879189', 'IPS', 'CHE', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Portman Road'),
  ('401879188', 'MUN', 'SUN', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Old Trafford'),
  ('401879187', 'NEW', 'NFO', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'St. James'' Park'),
  ('401879186', 'TOT', 'BHA', '2026-12-30T20:00:00+00:00'::timestamptz, 'league', 'GW18', 'Tottenham Hotspur Stadium'),
  ('401878729', 'BOU', 'AVL', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Vitality Stadium'),
  ('401879185', 'ARS', 'IPS', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Emirates Stadium'),
  ('401879184', 'BRE', 'CRY', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Gtech Community Stadium'),
  ('401878728', 'BHA', 'MUN', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'American Express Stadium'),
  ('401879183', 'CHE', 'NEW', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Stamford Bridge'),
  ('401879182', 'LEE', 'EVE', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Elland Road'),
  ('401879181', 'LIV', 'COV', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Anfield'),
  ('401879180', 'MCI', 'TOT', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Etihad Stadium'),
  ('401879179', 'NFO', 'FUL', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'The City Ground'),
  ('401879178', 'SUN', 'HUL', '2027-01-02T15:00:00+00:00'::timestamptz, 'league', 'GW19', 'Stadium of Light'),
  ('401879177', 'ARS', 'BRE', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Emirates Stadium'),
  ('401879176', 'BHA', 'BOU', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'American Express Stadium'),
  ('401879175', 'CRY', 'CHE', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Selhurst Park'),
  ('401879174', 'EVE', 'AVL', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Hill Dickinson Stadium'),
  ('401879173', 'FUL', 'TOT', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Craven Cottage'),
  ('401879172', 'IPS', 'COV', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Portman Road'),
  ('401879171', 'LEE', 'MCI', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Elland Road'),
  ('401879170', 'MUN', 'NEW', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Old Trafford'),
  ('401879169', 'NFO', 'HUL', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'The City Ground'),
  ('401878727', 'SUN', 'LIV', '2027-01-06T20:00:00+00:00'::timestamptz, 'league', 'GW20', 'Stadium of Light'),
  ('401878726', 'BOU', 'IPS', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Vitality Stadium'),
  ('401878725', 'AVL', 'MUN', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Villa Park'),
  ('401879168', 'BRE', 'BHA', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Gtech Community Stadium'),
  ('401879167', 'CHE', 'SUN', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Stamford Bridge'),
  ('401878724', 'COV', 'EVE', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Coventry Building Society Arena'),
  ('401878723', 'HUL', 'ARS', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'The MKM Stadium'),
  ('401879166', 'LIV', 'CRY', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Anfield'),
  ('401878722', 'MCI', 'NFO', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Etihad Stadium'),
  ('401878721', 'NEW', 'FUL', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'St. James'' Park'),
  ('401879165', 'TOT', 'LEE', '2027-01-16T15:00:00+00:00'::timestamptz, 'league', 'GW21', 'Tottenham Hotspur Stadium'),
  ('401878720', 'ARS', 'NEW', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Emirates Stadium'),
  ('401879164', 'BHA', 'MCI', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'American Express Stadium'),
  ('401879163', 'CRY', 'TOT', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Selhurst Park'),
  ('401879162', 'EVE', 'BRE', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Hill Dickinson Stadium'),
  ('401878719', 'FUL', 'AVL', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Craven Cottage'),
  ('401879161', 'IPS', 'HUL', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Portman Road'),
  ('401879160', 'LEE', 'CHE', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Elland Road'),
  ('401878718', 'MUN', 'LIV', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Old Trafford'),
  ('401878717', 'NFO', 'BOU', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'The City Ground'),
  ('401879159', 'SUN', 'COV', '2027-01-23T15:00:00+00:00'::timestamptz, 'league', 'GW22', 'Stadium of Light'),
  ('401879158', 'BOU', 'FUL', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Vitality Stadium'),
  ('401878716', 'AVL', 'IPS', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Villa Park'),
  ('401878715', 'BRE', 'MUN', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Gtech Community Stadium'),
  ('401878714', 'CHE', 'NFO', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Stamford Bridge'),
  ('401879157', 'COV', 'LEE', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Coventry Building Society Arena'),
  ('401879156', 'HUL', 'CRY', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'The MKM Stadium'),
  ('401879155', 'LIV', 'EVE', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Anfield'),
  ('401879154', 'MCI', 'ARS', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Etihad Stadium'),
  ('401878713', 'NEW', 'BHA', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'St. James'' Park'),
  ('401879153', 'TOT', 'SUN', '2027-01-30T15:00:00+00:00'::timestamptz, 'league', 'GW23', 'Tottenham Hotspur Stadium'),
  ('401878712', 'ARS', 'LIV', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Emirates Stadium'),
  ('401878711', 'BHA', 'HUL', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'American Express Stadium'),
  ('401879152', 'CRY', 'COV', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Selhurst Park'),
  ('401879151', 'EVE', 'NEW', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Hill Dickinson Stadium'),
  ('401879150', 'FUL', 'MCI', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Craven Cottage'),
  ('401879149', 'IPS', 'TOT', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Portman Road'),
  ('401878710', 'LEE', 'BOU', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Elland Road'),
  ('401879148', 'MUN', 'CHE', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Old Trafford'),
  ('401879147', 'NFO', 'BRE', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'The City Ground'),
  ('401878709', 'SUN', 'AVL', '2027-02-06T15:00:00+00:00'::timestamptz, 'league', 'GW24', 'Stadium of Light'),
  ('401879146', 'AVL', 'BOU', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Villa Park'),
  ('401879145', 'COV', 'LIV', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Coventry Building Society Arena'),
  ('401878708', 'CRY', 'BRE', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Selhurst Park'),
  ('401878707', 'EVE', 'LEE', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Hill Dickinson Stadium'),
  ('401879144', 'FUL', 'NFO', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Craven Cottage'),
  ('401879143', 'HUL', 'SUN', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'The MKM Stadium'),
  ('401878706', 'IPS', 'ARS', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Portman Road'),
  ('401879142', 'MUN', 'BHA', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Old Trafford'),
  ('401879141', 'NEW', 'CHE', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'St. James'' Park'),
  ('401879140', 'TOT', 'MCI', '2027-02-10T20:00:00+00:00'::timestamptz, 'league', 'GW25', 'Tottenham Hotspur Stadium'),
  ('401879139', 'BOU', 'CRY', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Vitality Stadium'),
  ('401878705', 'ARS', 'FUL', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Emirates Stadium'),
  ('401879138', 'BRE', 'COV', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Gtech Community Stadium'),
  ('401879137', 'BHA', 'TOT', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'American Express Stadium'),
  ('401878704', 'CHE', 'IPS', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Stamford Bridge'),
  ('401879136', 'LEE', 'AVL', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Elland Road'),
  ('401878703', 'LIV', 'HUL', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Anfield'),
  ('401879135', 'MCI', 'NEW', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Etihad Stadium'),
  ('401879134', 'NFO', 'MUN', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'The City Ground'),
  ('401878702', 'SUN', 'EVE', '2027-02-20T15:00:00+00:00'::timestamptz, 'league', 'GW26', 'Stadium of Light'),
  ('401879133', 'AVL', 'CHE', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Villa Park'),
  ('401879132', 'COV', 'BOU', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Coventry Building Society Arena'),
  ('401878701', 'CRY', 'SUN', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Selhurst Park'),
  ('401878700', 'EVE', 'NFO', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Hill Dickinson Stadium'),
  ('401878699', 'FUL', 'LEE', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Craven Cottage'),
  ('401878698', 'HUL', 'MCI', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'The MKM Stadium'),
  ('401879131', 'IPS', 'BHA', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Portman Road'),
  ('401878697', 'MUN', 'ARS', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Old Trafford'),
  ('401879130', 'NEW', 'BRE', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'St. James'' Park'),
  ('401879129', 'TOT', 'LIV', '2027-02-27T15:00:00+00:00'::timestamptz, 'league', 'GW27', 'Tottenham Hotspur Stadium'),
  ('401879128', 'BOU', 'TOT', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Vitality Stadium'),
  ('401878696', 'ARS', 'CRY', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Emirates Stadium'),
  ('401879127', 'BRE', 'IPS', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Gtech Community Stadium'),
  ('401878695', 'BHA', 'FUL', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'American Express Stadium'),
  ('401879126', 'CHE', 'COV', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Stamford Bridge'),
  ('401878694', 'LEE', 'HUL', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Elland Road'),
  ('401879125', 'LIV', 'AVL', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Anfield'),
  ('401879124', 'MCI', 'EVE', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Etihad Stadium'),
  ('401879123', 'NFO', 'NEW', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'The City Ground'),
  ('401879122', 'SUN', 'MUN', '2027-03-03T20:00:00+00:00'::timestamptz, 'league', 'GW28', 'Stadium of Light'),
  ('401879121', 'BOU', 'NEW', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Vitality Stadium'),
  ('401879120', 'AVL', 'HUL', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Villa Park'),
  ('401878693', 'CHE', 'ARS', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Stamford Bridge'),
  ('401878692', 'COV', 'MCI', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Coventry Building Society Arena'),
  ('401878691', 'CRY', 'FUL', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Selhurst Park'),
  ('401879119', 'LEE', 'BHA', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Elland Road'),
  ('401878690', 'LIV', 'IPS', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Anfield'),
  ('401879118', 'MUN', 'EVE', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Old Trafford'),
  ('401879117', 'SUN', 'BRE', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Stadium of Light'),
  ('401879116', 'TOT', 'NFO', '2027-03-13T15:00:00+00:00'::timestamptz, 'league', 'GW29', 'Tottenham Hotspur Stadium'),
  ('401879115', 'ARS', 'SUN', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Emirates Stadium'),
  ('401879114', 'BRE', 'BOU', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Gtech Community Stadium'),
  ('401879113', 'BHA', 'COV', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'American Express Stadium'),
  ('401879112', 'EVE', 'TOT', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Hill Dickinson Stadium'),
  ('401879111', 'FUL', 'LIV', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Craven Cottage'),
  ('401879110', 'HUL', 'CHE', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'The MKM Stadium'),
  ('401879109', 'IPS', 'CRY', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Portman Road'),
  ('401879108', 'MCI', 'MUN', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'Etihad Stadium'),
  ('401879107', 'NEW', 'LEE', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'St. James'' Park'),
  ('401878689', 'NFO', 'AVL', '2027-03-20T15:00:00+00:00'::timestamptz, 'league', 'GW30', 'The City Ground'),
  ('401879106', 'BOU', 'MCI', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Vitality Stadium'),
  ('401879105', 'AVL', 'BHA', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Villa Park'),
  ('401879104', 'CHE', 'FUL', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Stamford Bridge'),
  ('401879103', 'COV', 'ARS', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Coventry Building Society Arena'),
  ('401879102', 'CRY', 'EVE', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Selhurst Park'),
  ('401878688', 'LEE', 'NFO', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Elland Road'),
  ('401879101', 'LIV', 'NEW', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Anfield'),
  ('401879100', 'MUN', 'HUL', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Old Trafford'),
  ('401878687', 'SUN', 'IPS', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Stadium of Light'),
  ('401879099', 'TOT', 'BRE', '2027-04-10T14:00:00+00:00'::timestamptz, 'league', 'GW31', 'Tottenham Hotspur Stadium'),
  ('401878686', 'ARS', 'AVL', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Emirates Stadium'),
  ('401879098', 'BRE', 'LEE', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Gtech Community Stadium'),
  ('401878685', 'BHA', 'CHE', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'American Express Stadium'),
  ('401878684', 'EVE', 'BOU', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Hill Dickinson Stadium'),
  ('401879097', 'FUL', 'SUN', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Craven Cottage'),
  ('401878683', 'HUL', 'COV', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'The MKM Stadium'),
  ('401879096', 'IPS', 'MUN', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Portman Road'),
  ('401879095', 'MCI', 'CRY', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'Etihad Stadium'),
  ('401878682', 'NEW', 'TOT', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'St. James'' Park'),
  ('401878681', 'NFO', 'LIV', '2027-04-17T14:00:00+00:00'::timestamptz, 'league', 'GW32', 'The City Ground'),
  ('401878680', 'BOU', 'ARS', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Vitality Stadium'),
  ('401878679', 'AVL', 'COV', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Villa Park'),
  ('401878678', 'BRE', 'FUL', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Gtech Community Stadium'),
  ('401879094', 'CHE', 'MCI', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Stamford Bridge'),
  ('401879093', 'EVE', 'BHA', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Hill Dickinson Stadium'),
  ('401879092', 'LEE', 'LIV', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Elland Road'),
  ('401879091', 'MUN', 'CRY', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Old Trafford'),
  ('401879090', 'NEW', 'IPS', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'St. James'' Park'),
  ('401879089', 'NFO', 'SUN', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'The City Ground'),
  ('401878677', 'TOT', 'HUL', '2027-04-24T14:00:00+00:00'::timestamptz, 'league', 'GW33', 'Tottenham Hotspur Stadium'),
  ('401878676', 'ARS', 'TOT', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Emirates Stadium'),
  ('401879088', 'BHA', 'NFO', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'American Express Stadium'),
  ('401878675', 'COV', 'MUN', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Coventry Building Society Arena'),
  ('401879087', 'CRY', 'AVL', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Selhurst Park'),
  ('401879086', 'FUL', 'EVE', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Craven Cottage'),
  ('401879085', 'HUL', 'BOU', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'The MKM Stadium'),
  ('401879084', 'IPS', 'LEE', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Portman Road'),
  ('401878674', 'LIV', 'CHE', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Anfield'),
  ('401879083', 'MCI', 'BRE', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Etihad Stadium'),
  ('401878673', 'SUN', 'NEW', '2027-05-01T14:00:00+00:00'::timestamptz, 'league', 'GW34', 'Stadium of Light'),
  ('401878672', 'BOU', 'MUN', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Vitality Stadium'),
  ('401879082', 'BRE', 'AVL', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Gtech Community Stadium'),
  ('401878671', 'BHA', 'SUN', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'American Express Stadium'),
  ('401878670', 'EVE', 'HUL', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Hill Dickinson Stadium'),
  ('401878669', 'FUL', 'IPS', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Craven Cottage'),
  ('401879081', 'LEE', 'ARS', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Elland Road'),
  ('401878668', 'MCI', 'LIV', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Etihad Stadium'),
  ('401879080', 'NEW', 'COV', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'St. James'' Park'),
  ('401878667', 'NFO', 'CRY', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'The City Ground'),
  ('401878666', 'TOT', 'CHE', '2027-05-08T14:00:00+00:00'::timestamptz, 'league', 'GW35', 'Tottenham Hotspur Stadium'),
  ('401879079', 'ARS', 'NFO', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Emirates Stadium'),
  ('401878665', 'AVL', 'NEW', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Villa Park'),
  ('401879078', 'CHE', 'EVE', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Stamford Bridge'),
  ('401879077', 'COV', 'TOT', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Coventry Building Society Arena'),
  ('401878664', 'CRY', 'BHA', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Selhurst Park'),
  ('401879076', 'HUL', 'FUL', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'The MKM Stadium'),
  ('401879075', 'IPS', 'MCI', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Portman Road'),
  ('401878663', 'LIV', 'BRE', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Anfield'),
  ('401879074', 'MUN', 'LEE', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Old Trafford'),
  ('401879073', 'SUN', 'BOU', '2027-05-15T14:00:00+00:00'::timestamptz, 'league', 'GW36', 'Stadium of Light'),
  ('401879072', 'BOU', 'CHE', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Vitality Stadium'),
  ('401879071', 'BRE', 'HUL', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Gtech Community Stadium'),
  ('401878662', 'BHA', 'LIV', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'American Express Stadium'),
  ('401879070', 'EVE', 'ARS', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Hill Dickinson Stadium'),
  ('401879069', 'FUL', 'COV', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Craven Cottage'),
  ('401879068', 'LEE', 'SUN', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Elland Road'),
  ('401879067', 'MCI', 'AVL', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Etihad Stadium'),
  ('401879066', 'NEW', 'CRY', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'St. James'' Park'),
  ('401878661', 'NFO', 'IPS', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'The City Ground'),
  ('401879065', 'TOT', 'MUN', '2027-05-23T14:00:00+00:00'::timestamptz, 'league', 'GW37', 'Tottenham Hotspur Stadium'),
  ('401878660', 'ARS', 'BHA', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Emirates Stadium'),
  ('401879064', 'AVL', 'TOT', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Villa Park'),
  ('401879063', 'CHE', 'BRE', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Stamford Bridge'),
  ('401878659', 'COV', 'NFO', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Coventry Building Society Arena'),
  ('401879062', 'CRY', 'LEE', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Selhurst Park'),
  ('401879061', 'HUL', 'NEW', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'The MKM Stadium'),
  ('401879060', 'IPS', 'EVE', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Portman Road'),
  ('401879059', 'LIV', 'BOU', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Anfield'),
  ('401879058', 'MUN', 'FUL', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Old Trafford'),
  ('401878658', 'SUN', 'MCI', '2027-05-30T15:00:00+00:00'::timestamptz, 'league', 'GW38', 'Stadium of Light'),
  ('401875219', 'ARS', 'MCI', '2026-08-16T14:00:00+00:00'::timestamptz, 'community_shield', 'Community Shield', 'Principality Stadium');

-- 1. Adopt fixtures that already exist (the hand-loaded GW1) by team pair +
--    kickoff day, so they get stamped instead of duplicated.
UPDATE public.matches m
SET espn_event_id = f.espn_event_id
FROM _fx f
JOIN public.teams th ON th.code = f.home_code
JOIN public.teams ta ON ta.code = f.away_code
WHERE m.espn_event_id IS NULL
  AND date(m.kickoff_utc) = date(f.kickoff_utc)
  AND ((m.team_a_id = th.id AND m.team_b_id = ta.id)
    OR (m.team_a_id = ta.id AND m.team_b_id = th.id));

-- 2. Insert the rest; refresh schedule details on rows we already have.
--    Scores and status are deliberately untouched — the sync-matches function
--    owns those.
INSERT INTO public.matches
  (espn_event_id, team_a_id, team_b_id, kickoff_utc, stage, group_name, venue, status, time_tbc)
SELECT f.espn_event_id, th.id, ta.id, f.kickoff_utc, f.stage, f.group_name, f.venue,
       'scheduled', false
FROM _fx f
JOIN public.teams th ON th.code = f.home_code
JOIN public.teams ta ON ta.code = f.away_code
ON CONFLICT (espn_event_id) WHERE espn_event_id IS NOT NULL DO UPDATE
SET kickoff_utc = EXCLUDED.kickoff_utc,
    stage       = EXCLUDED.stage,
    group_name  = EXCLUDED.group_name,
    venue       = EXCLUDED.venue,
    team_a_id   = EXCLUDED.team_a_id,
    team_b_id   = EXCLUDED.team_b_id;

COMMIT;


-- ============================================================
-- 3/4  Fantasy pool  (tables + the nine entries)
-- source: supabase/migrations/20260821000000_fantasy_pool.sql
-- ============================================================
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


-- ============================================================
-- 4/4  Clear retired pick data
-- source: supabase/cleanup_old_pool_data.sql
-- ============================================================
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


-- ============================================================
-- Tell PostgREST about the new tables/columns straight away,
-- so the app sees them without waiting for a cache refresh.
-- ============================================================
NOTIFY pgrst, 'reload schema';
