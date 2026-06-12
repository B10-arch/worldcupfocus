-- Team popularity: how many players have backed each nation. A SECURITY DEFINER
-- view so every authenticated user sees the aggregate counts (it exposes only
-- team -> count, never individual bets/users).

DROP VIEW IF EXISTS public.team_popularity;
CREATE VIEW public.team_popularity
WITH (security_invoker = false) AS
SELECT
  t.id          AS team_id,
  t.name,
  t.code,
  t.flag_emoji,
  t.fifa_rank,
  COUNT(b.id)::int AS backers
FROM public.teams t
LEFT JOIN public.bets b ON b.team_id = t.id
GROUP BY t.id, t.name, t.code, t.flag_emoji, t.fifa_rank;

GRANT SELECT ON public.team_popularity TO authenticated;
