-- The leaderboard must show ALL players to every logged-in user.
--
-- leaderboard_entries was created WITH (security_invoker = true), so it ran under
-- each viewer's RLS. Because profiles is locked to "own row only" (see
-- 20260608060249), the profiles join returned just the current user — so everyone
-- saw a leaderboard of one (themselves).
--
-- Recreate it as a SECURITY DEFINER view (security_invoker = false): it aggregates
-- every user regardless of the viewer's RLS, while the base profiles table stays
-- locked. The view exposes only leaderboard-safe columns (display_name, avatar_url,
-- points, picks) — never payment_status — so participant payment status stays
-- private. Granted to authenticated only (the leaderboard page is auth-gated).

DROP VIEW IF EXISTS public.leaderboard_entries;
CREATE VIEW public.leaderboard_entries
WITH (security_invoker = false) AS
SELECT
  p.id              AS user_id,
  p.display_name,
  p.avatar_url,
  COALESCE(SUM(b.points), 0)::int AS points,
  COUNT(b.id)::int   AS pick_count,
  MIN(b.placed_at)   AS first_placed_at,
  MAX(b.placed_at)   AS confirmed_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'bet_id',     b.id,
        'team_id',    t.id,
        'team_name',  t.name,
        'team_code',  t.code,
        'team_flag_emoji', t.flag_emoji,
        'fifa_rank',  t.fifa_rank,
        'points',     b.points,
        'placed_at',  b.placed_at
      ) ORDER BY t.name
    ) FILTER (WHERE b.id IS NOT NULL),
    '[]'::jsonb
  ) AS picks
FROM public.profiles p
LEFT JOIN public.bets  b ON b.user_id = p.id
LEFT JOIN public.teams t ON t.id = b.team_id
GROUP BY p.id;

GRANT SELECT ON public.leaderboard_entries TO authenticated;
