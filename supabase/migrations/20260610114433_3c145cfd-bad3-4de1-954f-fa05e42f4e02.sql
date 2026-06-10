
-- Allow authenticated users to see all bets (needed for leaderboard to show each user's teams)
CREATE POLICY "authenticated can view all bets"
  ON public.bets FOR SELECT TO authenticated USING (true);

-- Per-question quiz reveal: returns correct answer immediately after a selection
CREATE OR REPLACE FUNCTION public.reveal_daily_quiz_answer(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.current_npt_date();
  v_quiz  public.daily_quizzes%ROWTYPE;
  v_correct_index int;
  v_explanation text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_quiz FROM public.daily_quizzes WHERE quiz_date = v_today;
  IF NOT FOUND THEN RAISE EXCEPTION 'No quiz today'; END IF;
  IF NOT (p_question_id = ANY(v_quiz.question_ids)) THEN
    RAISE EXCEPTION 'Question not in today''s quiz';
  END IF;
  SELECT correct_index, explanation INTO v_correct_index, v_explanation
    FROM public.quiz_questions WHERE id = p_question_id;
  RETURN jsonb_build_object('correct_index', v_correct_index, 'explanation', v_explanation);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reveal_daily_quiz_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_daily_quiz_answer(uuid) TO authenticated;
