
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_total_bet_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bets TO authenticated;
GRANT ALL ON public.bets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
