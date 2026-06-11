-- A safe, public-within-the-pool view of profiles for features that need other
-- users' display names (e.g. the daily-quiz attempt leaderboard). The base
-- profiles table is locked to "own row only", which is correct for privacy
-- (payment_status), but it also hid every other player's name.
--
-- This SECURITY DEFINER view exposes ONLY id/display_name/avatar_url (never
-- payment_status), readable by any authenticated user — mirroring how
-- leaderboard_entries was fixed.

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT id, display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;
