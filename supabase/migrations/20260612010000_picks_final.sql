-- Freeze picks for participants who have already chosen their team(s). Their
-- selections are final — they cannot add, remove, or change a pick — while new
-- joiners can still pick until the global deadline.
--
-- A per-user flag (set on everyone who currently has a bet) drives this, enforced
-- in the existing enforce_bet_lock trigger so it's bypass-proof (server fn OR
-- direct API). Admins/service-role remain exempt.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS picks_locked boolean NOT NULL DEFAULT false;

-- Lock everyone who has already chosen (has at least one bet) right now.
UPDATE public.profiles p
SET picks_locked = true
WHERE EXISTS (SELECT 1 FROM public.bets b WHERE b.user_id = p.id);

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

  -- Global deadline: 22:00 NPT on 2026-06-12 == 16:15 UTC.
  IF now() >= TIMESTAMPTZ '2026-06-12 16:15:00+00' THEN
    RAISE EXCEPTION 'Picks are locked — the 22:00 NPT deadline has passed.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Per-user freeze: a participant who has already chosen is final.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.picks_locked) THEN
    RAISE EXCEPTION 'Your team picks are final and can no longer be changed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
