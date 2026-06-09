
-- 1. Recreate leaderboard_entries view with security_invoker
DROP VIEW IF EXISTS public.leaderboard_entries;
CREATE VIEW public.leaderboard_entries
WITH (security_invoker = true) AS
SELECT b.id AS bet_id,
       b.user_id,
       b.team_id,
       b.points,
       b.placed_at,
       p.display_name,
       p.avatar_url,
       t.name AS team_name,
       t.code AS team_code,
       t.flag_emoji AS team_flag_emoji
  FROM bets b
  LEFT JOIN profiles p ON p.id = b.user_id
  LEFT JOIN teams t ON t.id = b.team_id;
GRANT SELECT ON public.leaderboard_entries TO authenticated;
GRANT SELECT ON public.leaderboard_entries TO anon;

-- 2. Revoke EXECUTE on SECURITY DEFINER functions from PUBLIC and anon (keep authenticated/service_role)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_total_bet_count() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_total_bet_count() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, integer) TO authenticated, service_role;

-- 3. Prevent users from updating their own payment_status via a trigger
CREATE OR REPLACE FUNCTION public.prevent_self_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NOT public.has_role(auth.uid(), 'admin')
  THEN
    RAISE EXCEPTION 'payment_status can only be changed by admins';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_self_payment_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_self_payment_status ON public.profiles;
CREATE TRIGGER trg_prevent_self_payment_status
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_self_payment_status_change();

-- 4. Hide quiz_questions.correct_index from clients via column-level privileges.
REVOKE SELECT ON public.quiz_questions FROM authenticated, anon;
GRANT SELECT (id, tier, question, options, explanation, created_at)
  ON public.quiz_questions TO authenticated;
-- submit_quiz_answer (SECURITY DEFINER) is the only way to learn correct_index.
