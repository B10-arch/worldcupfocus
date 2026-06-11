-- The quiz page needs to show OTHER players' data: a streaks sidebar and the
-- today's-score mini-leaderboard. daily_quiz_attempts is locked to own-row
-- (correct — it keeps each player's chosen answers private), so direct reads
-- only return the current user. These SECURITY DEFINER views expose only safe,
-- aggregated columns (scores + streaks + display_name, never the answers jsonb),
-- readable by any authenticated user. Same pattern as leaderboard_entries /
-- public_profiles.

-- Per-attempt scoreboard (any day), with display name, WITHOUT answers.
DROP VIEW IF EXISTS public.daily_quiz_scoreboard;
CREATE VIEW public.daily_quiz_scoreboard
WITH (security_invoker = false) AS
SELECT
  a.id,
  a.user_id,
  p.display_name,
  a.quiz_date,
  a.score,
  a.total,
  a.completed_at
FROM public.daily_quiz_attempts a
JOIN public.profiles p ON p.id = a.user_id;
GRANT SELECT ON public.daily_quiz_scoreboard TO authenticated;

-- Per-user quiz streaks (current + longest), computed across ALL players using
-- the same islands-and-gaps logic as get_daily_quiz(): consecutive attempt dates
-- share a constant (date - row_number). Current streak = the run ending today
-- (if played) or yesterday (still alive); otherwise 0.
DROP VIEW IF EXISTS public.quiz_streaks;
CREATE VIEW public.quiz_streaks
WITH (security_invoker = false) AS
WITH user_days AS (
  SELECT DISTINCT user_id, quiz_date AS d
  FROM public.daily_quiz_attempts
),
grouped AS (
  SELECT user_id, d,
         (d - (row_number() OVER (PARTITION BY user_id ORDER BY d))::int) AS grp
  FROM user_days
),
runs AS (
  SELECT user_id, grp, COUNT(*)::int AS len, MAX(d) AS last_day
  FROM grouped
  GROUP BY user_id, grp
),
agg AS (
  SELECT
    user_id,
    COALESCE(MAX(len), 0) AS longest_streak,
    COALESCE(MAX(len) FILTER (WHERE last_day = public.current_npt_date()),     0) AS run_today,
    COALESCE(MAX(len) FILTER (WHERE last_day = public.current_npt_date() - 1), 0) AS run_yesterday,
    bool_or(last_day = public.current_npt_date()) AS played_today
  FROM runs
  GROUP BY user_id
)
SELECT
  a.user_id,
  p.display_name,
  p.avatar_url,
  CASE WHEN a.played_today THEN a.run_today ELSE a.run_yesterday END AS current_streak,
  a.longest_streak,
  a.played_today
FROM agg a
JOIN public.profiles p ON p.id = a.user_id;
GRANT SELECT ON public.quiz_streaks TO authenticated;
