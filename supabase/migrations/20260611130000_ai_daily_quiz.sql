-- =========================================================
-- AI-generated daily quiz
--   * 10 fresh questions per day (was 7)
--   * Gemini generates the day's questions (see src/lib/quiz.functions.ts).
--     The app calls daily_quiz_status() to decide whether to generate, then
--     upsert_daily_quiz_from_ai() to persist. Both are idempotent + NPT-day
--     aware so concurrent visitors can't create two quizzes for the same day.
--   * get_daily_quiz() keeps a pool-based fallback (now 10) so the page never
--     breaks if generation is skipped (no API key, Gemini error, etc.).
--   * Richer streak: current + longest + played_today.
-- Idempotent: safe to re-run.
-- =========================================================

-- Track where a question came from ('seed' = migration-seeded, 'ai' = Gemini).
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seed';

-- ---------------------------------------------------------
-- daily_quiz_status(): does today's quiz already exist, and which question
-- texts were used recently (so the generator can avoid repeating them)?
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_quiz_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today  date := public.current_npt_date();
  v_exists boolean;
  v_recent jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_exists := EXISTS (SELECT 1 FROM public.daily_quizzes WHERE quiz_date = v_today);

  SELECT COALESCE(jsonb_agg(q.question), '[]'::jsonb)
    INTO v_recent
    FROM (
      SELECT question
      FROM public.quiz_questions
      ORDER BY COALESCE(last_used_on, '1970-01-01'::date) DESC, created_at DESC
      LIMIT 80
    ) q;

  RETURN jsonb_build_object(
    'exists',           v_exists,
    'quiz_date',        v_today,
    'recent_questions', v_recent
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.daily_quiz_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.daily_quiz_status() TO authenticated, service_role;

-- ---------------------------------------------------------
-- upsert_daily_quiz_from_ai(p_questions): persist a freshly generated set.
-- p_questions is a JSON array of:
--   { question, options:[4 strings], correct_index:int, explanation, tier }
-- Idempotent: if today's quiz already exists it is a no-op. An advisory lock
-- serializes concurrent generators for the same NPT day.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_daily_quiz_from_ai(p_questions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today    date := public.current_npt_date();
  v_existing public.daily_quizzes%ROWTYPE;
  v_ids      uuid[] := '{}';
  v_id       uuid;
  v_q        jsonb;
  v_fact     uuid;
  v_count    int;
  v_opts     jsonb;
  v_correct  int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Serialize concurrent generators for the same day.
  PERFORM pg_advisory_xact_lock(hashtext('daily_quiz_' || v_today::text));

  SELECT * INTO v_existing FROM public.daily_quizzes WHERE quiz_date = v_today;
  IF FOUND THEN
    RETURN jsonb_build_object('created', false, 'quiz_date', v_today,
                              'count', array_length(v_existing.question_ids, 1));
  END IF;

  v_count := jsonb_array_length(p_questions);
  IF v_count IS NULL OR v_count < 1 THEN
    RAISE EXCEPTION 'No questions provided';
  END IF;

  FOR v_q IN SELECT value FROM jsonb_array_elements(p_questions) AS t(value) LOOP
    v_opts := v_q->'options';
    CONTINUE WHEN jsonb_typeof(v_opts) <> 'array' OR jsonb_array_length(v_opts) < 2;
    CONTINUE WHEN COALESCE(v_q->>'question', '') = '';

    -- Clamp correct_index into the valid range for safety.
    v_correct := LEAST(GREATEST(COALESCE((v_q->>'correct_index')::int, 0), 0),
                       jsonb_array_length(v_opts) - 1);

    INSERT INTO public.quiz_questions
      (tier, question, options, correct_index, explanation, source, last_used_on)
    VALUES (
      CASE lower(COALESCE(v_q->>'tier', ''))
        WHEN 'beginner'  THEN 'beginner'::public.quiz_tier
        WHEN 'expertise' THEN 'expertise'::public.quiz_tier
        ELSE 'professional'::public.quiz_tier
      END,
      v_q->>'question',
      v_opts,
      v_correct,
      NULLIF(v_q->>'explanation', ''),
      'ai',
      v_today
    )
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No valid questions to insert';
  END IF;

  SELECT id INTO v_fact FROM public.trivia_facts ORDER BY random() LIMIT 1;

  INSERT INTO public.daily_quizzes (quiz_date, question_ids, trivia_fact_id)
  VALUES (v_today, v_ids, v_fact)
  ON CONFLICT (quiz_date) DO NOTHING;

  RETURN jsonb_build_object('created', true, 'quiz_date', v_today,
                            'count', array_length(v_ids, 1));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_daily_quiz_from_ai(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_daily_quiz_from_ai(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------
-- get_daily_quiz(): now 10 questions + richer streak (current/longest/today).
-- Pool fallback only runs if no quiz was generated for today yet.
-- ---------------------------------------------------------
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
  v_total_qs int;
  v_size int := 10;
  v_played_today boolean;
  v_longest int := 0;
  v_run_today int := 0;
  v_run_yesterday int := 0;
  v_streak int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;

  -- Fallback: if AI generation didn't run, build today's quiz from the pool.
  IF NOT FOUND THEN
    SELECT COUNT(*) INTO v_total_qs FROM public.quiz_questions;
    IF v_total_qs = 0 THEN
      RETURN jsonb_build_object('quiz_date', v_today, 'questions', '[]'::jsonb,
                                'trivia_fact', NULL, 'attempt', NULL,
                                'streak', 0, 'longest_streak', 0, 'played_today', false);
    END IF;
    v_size := LEAST(v_size, v_total_qs);

    -- Prefer never-used; fall back to oldest last_used_on. Deterministic per day.
    PERFORM setseed(
      ( (extract(epoch from v_today)::bigint % 100000)::float / 100000.0 )
    );

    SELECT array_agg(id) INTO v_qids FROM (
      SELECT id FROM public.quiz_questions
      ORDER BY last_used_on NULLS FIRST, random()
      LIMIT v_size
    ) s;

    SELECT id INTO v_fact FROM public.trivia_facts ORDER BY random() LIMIT 1;

    INSERT INTO public.daily_quizzes (quiz_date, question_ids, trivia_fact_id)
    VALUES (v_today, v_qids, v_fact)
    ON CONFLICT (quiz_date) DO NOTHING
    RETURNING * INTO v_quiz;

    IF v_quiz.quiz_date IS NULL THEN
      SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;
    END IF;

    UPDATE public.quiz_questions SET last_used_on = v_today WHERE id = ANY(v_quiz.question_ids);
  END IF;

  -- Build safe question payload (NO correct_index).
  SELECT jsonb_agg(jsonb_build_object(
    'id', q.id, 'question', q.question, 'options', q.options, 'tier', q.tier
  ) ORDER BY array_position(v_quiz.question_ids, q.id))
  INTO v_questions
  FROM public.quiz_questions q
  WHERE q.id = ANY(v_quiz.question_ids);

  SELECT to_jsonb(a) INTO v_attempt
    FROM public.daily_quiz_attempts a
    WHERE a.user_id = v_uid AND a.quiz_date = v_today;
  v_played_today := (v_attempt IS NOT NULL);

  -- Streak via the islands-and-gaps trick: consecutive distinct attempt dates
  -- share a constant (date - row_number). The current streak is the run ending
  -- today (if played) or the run ending yesterday (still alive, "at risk").
  WITH user_days AS (
    SELECT DISTINCT quiz_date AS d
    FROM public.daily_quiz_attempts
    WHERE user_id = v_uid
  ),
  grouped AS (
    SELECT d, (d - (row_number() OVER (ORDER BY d))::int) AS grp
    FROM user_days
  ),
  runs AS (
    SELECT grp, COUNT(*)::int AS len, MAX(d) AS last_day
    FROM grouped
    GROUP BY grp
  )
  SELECT
    COALESCE(MAX(len), 0),
    COALESCE(MAX(len) FILTER (WHERE last_day = v_today),     0),
    COALESCE(MAX(len) FILTER (WHERE last_day = v_today - 1), 0)
  INTO v_longest, v_run_today, v_run_yesterday
  FROM runs;

  v_streak := CASE WHEN v_played_today THEN v_run_today ELSE v_run_yesterday END;

  RETURN jsonb_build_object(
    'quiz_date',      v_quiz.quiz_date,
    'questions',      COALESCE(v_questions, '[]'::jsonb),
    'trivia_fact',    (SELECT to_jsonb(f) FROM public.trivia_facts f WHERE f.id = v_quiz.trivia_fact_id),
    'attempt',        v_attempt,
    'streak',         v_streak,
    'longest_streak', GREATEST(v_longest, v_streak),
    'played_today',   v_played_today
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_daily_quiz() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_daily_quiz() TO authenticated, service_role;
