
DROP POLICY IF EXISTS "bets readable by authenticated" ON public.bets;
CREATE POLICY "users see own bet" ON public.bets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins see all bets" ON public.bets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "users see own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "admins see all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.leaderboard_entries
WITH (security_invoker = false) AS
SELECT b.id AS bet_id, b.user_id, b.team_id, b.points, b.placed_at,
       p.display_name, p.avatar_url,
       t.name AS team_name, t.code AS team_code, t.flag_emoji AS team_flag_emoji
FROM public.bets b
LEFT JOIN public.profiles p ON p.id = b.user_id
LEFT JOIN public.teams t ON t.id = b.team_id;
GRANT SELECT ON public.leaderboard_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.get_total_bet_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COUNT(*)::int FROM public.bets; $$;
GRANT EXECUTE ON FUNCTION public.get_total_bet_count() TO authenticated;

REVOKE SELECT ON public.quiz_questions FROM authenticated;
REVOKE SELECT ON public.quiz_questions FROM anon;
GRANT SELECT (id, tier, question, options, explanation, created_at) ON public.quiz_questions TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_answer(p_question_id uuid, p_choice integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_correct_index integer; v_explanation text; v_is_correct boolean; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT correct_index, explanation INTO v_correct_index, v_explanation
    FROM public.quiz_questions WHERE id = p_question_id;
  IF v_correct_index IS NULL THEN RAISE EXCEPTION 'Unknown question'; END IF;
  v_is_correct := (p_choice = v_correct_index);
  INSERT INTO public.quiz_progress (user_id, question_id, correct)
  VALUES (v_uid, p_question_id, v_is_correct)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('correct', v_is_correct, 'correct_index', v_correct_index, 'explanation', v_explanation);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) TO authenticated;
