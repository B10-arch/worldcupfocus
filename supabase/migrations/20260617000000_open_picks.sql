-- Re-open team picks for the tournament.
--
-- The pool was locked in three layers, all pinned to the 2026-06-12 22:00 NPT
-- deadline: the UI, the server functions (both via isBetLocked in
-- src/lib/time.ts), and this DB trigger. With the deadline past, NOBODY could
-- add a team — including brand-new visitors who had never picked.
--
-- This migration lifts the global deadline so late joiners can add a team
-- throughout the tournament, and clears the per-user finalization freeze so
-- existing participants can finish/adjust their picks too. The per-user freeze
-- branch is KEPT in the trigger so picks can be re-locked later simply by
-- setting profiles.picks_locked = true (and re-adding the deadline branch +
-- flipping BET_LOCK_ENABLED to true in src/lib/time.ts).
--
-- Idempotent: safe to run more than once.

-- 1) Unfreeze everyone who was previously marked final.
UPDATE public.profiles SET picks_locked = false WHERE picks_locked;

-- 2) Remove the global-deadline check from the bet-lock trigger function.
CREATE OR REPLACE FUNCTION public.enforce_bet_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  -- Admins and service-role (auth.uid() IS NULL) bypass all of this.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Global pick deadline is OFF — late joiners can pick throughout the
  -- tournament. To re-lock, re-add a RAISE here guarded by a deadline, e.g.:
  --   IF now() >= TIMESTAMPTZ '2026-06-12 16:15:00+00' THEN RAISE EXCEPTION ...

  -- Per-user freeze: a finalized participant cannot add/remove/change picks.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.picks_locked) THEN
    RAISE EXCEPTION 'Your team picks are final and can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
