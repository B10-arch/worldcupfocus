
REVOKE EXECUTE ON FUNCTION public.get_total_bet_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_total_bet_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) TO authenticated;
REVOKE SELECT ON public.leaderboard_entries FROM PUBLIC, anon;
GRANT SELECT ON public.leaderboard_entries TO authenticated;
