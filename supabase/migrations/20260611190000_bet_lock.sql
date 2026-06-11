-- Hard bet-lock at the database level: after the deadline, regular participants
-- cannot insert, change, or remove a pick — no matter how the write is attempted
-- (app server function OR a direct PostgREST call). The app's RLS otherwise lets
-- a user write their own bets, so a UI-only check was bypassable.
--
-- Deadline: 11:59 AM NPT on 2026-06-11 == 06:14 UTC. Keep in sync with
-- BET_LOCK_UTC in src/lib/time.ts.
--
-- Admins and service-role (auth.uid() IS NULL) are exempt, so admin fixes and
-- user-deletion cascades (which delete bet rows) still work after the lock.

CREATE OR REPLACE FUNCTION public.enforce_bet_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND now() >= TIMESTAMPTZ '2026-06-11 06:14:00+00' THEN
    RAISE EXCEPTION 'Picks are locked — the 11:59 AM NPT deadline has passed.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bet_lock ON public.bets;
CREATE TRIGGER trg_enforce_bet_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_bet_lock();
