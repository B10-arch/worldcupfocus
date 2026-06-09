
-- =========================================================
-- 1. Bets: allow up to 3 picks per user, no duplicate teams
-- =========================================================
ALTER TABLE public.bets DROP CONSTRAINT IF EXISTS bets_user_id_key;
ALTER TABLE public.bets
  ADD CONSTRAINT bets_user_team_unique UNIQUE (user_id, team_id);

-- Cap at 3 picks per user via trigger (CHECK can't query rows).
CREATE OR REPLACE FUNCTION public.enforce_max_three_picks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c int;
BEGIN
  SELECT COUNT(*) INTO c FROM public.bets WHERE user_id = NEW.user_id;
  IF c >= 3 THEN
    RAISE EXCEPTION 'You may back at most 3 teams.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_max_three_picks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_max_three_picks ON public.bets;
CREATE TRIGGER trg_enforce_max_three_picks
BEFORE INSERT ON public.bets
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_three_picks();

-- =========================================================
-- 2. Rebuild leaderboard_entries: one row per user with picks aggregated
-- =========================================================
DROP VIEW IF EXISTS public.leaderboard_entries;
CREATE VIEW public.leaderboard_entries
WITH (security_invoker = true) AS
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
GRANT SELECT ON public.leaderboard_entries TO authenticated, anon;

-- =========================================================
-- 3. Daily quiz schema
-- =========================================================
ALTER TABLE public.quiz_questions ADD COLUMN IF NOT EXISTS last_used_on date;

CREATE TABLE IF NOT EXISTS public.daily_quizzes (
  quiz_date       date PRIMARY KEY,
  question_ids    uuid[] NOT NULL,
  trivia_fact_id  uuid REFERENCES public.trivia_facts(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_quizzes TO authenticated;
GRANT ALL ON public.daily_quizzes TO service_role;
ALTER TABLE public.daily_quizzes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily quizzes readable" ON public.daily_quizzes;
CREATE POLICY "daily quizzes readable" ON public.daily_quizzes
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.daily_quiz_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_date       date NOT NULL REFERENCES public.daily_quizzes(quiz_date) ON DELETE CASCADE,
  score           int  NOT NULL DEFAULT 0,
  total           int  NOT NULL DEFAULT 0,
  answers         jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quiz_date)
);
GRANT SELECT, INSERT ON public.daily_quiz_attempts TO authenticated;
GRANT ALL ON public.daily_quiz_attempts TO service_role;
ALTER TABLE public.daily_quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users see own attempts" ON public.daily_quiz_attempts;
CREATE POLICY "users see own attempts" ON public.daily_quiz_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "users insert own attempts" ON public.daily_quiz_attempts;
CREATE POLICY "users insert own attempts" ON public.daily_quiz_attempts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- 4. Daily quiz helpers
--    Uses NPT (UTC+05:45) to compute "today".
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_npt_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT ((now() AT TIME ZONE 'UTC') + interval '5 hours 45 minutes')::date;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_quiz()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.current_npt_date();
  v_quiz  public.daily_quizzes%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_qids  uuid[];
  v_fact  uuid;
  v_questions jsonb;
  v_attempt jsonb := NULL;
  v_streak int := 0;
  v_total_qs int;
  v_size int := 7;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;

  IF NOT FOUND THEN
    SELECT COUNT(*) INTO v_total_qs FROM public.quiz_questions;
    IF v_total_qs = 0 THEN
      RETURN jsonb_build_object('quiz_date', v_today, 'questions', '[]'::jsonb,
                                'trivia_fact', NULL, 'attempt', NULL, 'streak', 0);
    END IF;
    v_size := LEAST(v_size, v_total_qs);

    -- Prefer never-used; fall back to oldest last_used_on. Deterministic per day via seed.
    PERFORM setseed(
      ( (extract(epoch from v_today)::bigint % 100000)::float / 100000.0 )
    );

    SELECT array_agg(id) INTO v_qids FROM (
      SELECT id FROM public.quiz_questions
      ORDER BY last_used_on NULLS FIRST, random()
      LIMIT v_size
    ) s;

    SELECT id INTO v_fact FROM public.trivia_facts
      ORDER BY random() LIMIT 1;

    INSERT INTO public.daily_quizzes (quiz_date, question_ids, trivia_fact_id)
    VALUES (v_today, v_qids, v_fact)
    ON CONFLICT (quiz_date) DO NOTHING
    RETURNING * INTO v_quiz;

    IF v_quiz.quiz_date IS NULL THEN
      SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;
    END IF;

    UPDATE public.quiz_questions SET last_used_on = v_today WHERE id = ANY(v_quiz.question_ids);
  END IF;

  -- Build safe question payload (NO correct_index)
  SELECT jsonb_agg(jsonb_build_object(
    'id', q.id, 'question', q.question, 'options', q.options, 'tier', q.tier
  ) ORDER BY array_position(v_quiz.question_ids, q.id))
  INTO v_questions
  FROM public.quiz_questions q
  WHERE q.id = ANY(v_quiz.question_ids);

  SELECT to_jsonb(a) INTO v_attempt
    FROM public.daily_quiz_attempts a
    WHERE a.user_id = v_uid AND a.quiz_date = v_today;

  -- Simple streak: consecutive days up to and including yesterday with an attempt.
  WITH RECURSIVE days(d) AS (
    SELECT v_today - 1
    UNION ALL
    SELECT d - 1 FROM days
      WHERE EXISTS (SELECT 1 FROM public.daily_quiz_attempts
                    WHERE user_id = v_uid AND quiz_date = d)
      AND d > v_today - 60
  )
  SELECT COUNT(*) INTO v_streak FROM days
    WHERE EXISTS (SELECT 1 FROM public.daily_quiz_attempts
                  WHERE user_id = v_uid AND quiz_date = days.d);
  IF v_attempt IS NOT NULL THEN v_streak := v_streak + 1; END IF;

  RETURN jsonb_build_object(
    'quiz_date',  v_quiz.quiz_date,
    'questions',  COALESCE(v_questions, '[]'::jsonb),
    'trivia_fact', (SELECT to_jsonb(f) FROM public.trivia_facts f WHERE f.id = v_quiz.trivia_fact_id),
    'attempt',    v_attempt,
    'streak',     v_streak
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_quiz() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_daily_quiz() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_daily_quiz_attempt(p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.current_npt_date();
  v_quiz  public.daily_quizzes%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_score int := 0;
  v_total int;
  v_qid   uuid;
  v_correct_index int;
  v_chosen int;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;
  IF NOT FOUND THEN RAISE EXCEPTION 'No quiz for today yet'; END IF;

  IF EXISTS (SELECT 1 FROM public.daily_quiz_attempts WHERE user_id = v_uid AND quiz_date = v_today) THEN
    RAISE EXCEPTION 'You already attempted today''s quiz';
  END IF;

  v_total := array_length(v_quiz.question_ids, 1);
  FOREACH v_qid IN ARRAY v_quiz.question_ids LOOP
    SELECT correct_index INTO v_correct_index FROM public.quiz_questions WHERE id = v_qid;
    v_chosen := COALESCE((p_answers ->> v_qid::text)::int, -1);
    IF v_chosen = v_correct_index THEN v_score := v_score + 1; END IF;
    v_breakdown := v_breakdown || jsonb_build_object(
      'question_id', v_qid, 'chosen', v_chosen, 'correct_index', v_correct_index
    );
  END LOOP;

  INSERT INTO public.daily_quiz_attempts (user_id, quiz_date, score, total, answers)
  VALUES (v_uid, v_today, v_score, v_total, p_answers);

  RETURN jsonb_build_object('score', v_score, 'total', v_total, 'breakdown', v_breakdown);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_daily_quiz_attempt(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_daily_quiz_attempt(jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.current_npt_date() FROM PUBLIC;
