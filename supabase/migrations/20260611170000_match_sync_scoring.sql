-- Live match sync support: recompute pool points from finished match results.
--
-- Scoring rule: each backed team earns 3 per win, 1 per draw, 0 per loss,
-- summed across all its FINISHED matches. Every bet on a team is set to that
-- team's running total. Called by the sync-matches edge function after it
-- updates match scores/status from the live feed.

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
      ON (m.team_a_id = t.id OR m.team_b_id = t.id) AND m.status = 'finished'
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
