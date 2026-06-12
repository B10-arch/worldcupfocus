-- =========================================================
-- Per-match highlights video (admin-managed).
--   * Admins paste a YouTube (or other embeddable) URL per match from the Admin
--     page. The dashboard Match Center shows a "Highlights" button that embeds it
--     in a popup. Blank → the popup falls back to a YouTube search link.
--   * Human-curated on purpose: no reliable source auto-provides real,
--     Nepal-playable highlights per match (official broadcaster clips are
--     region-locked; most globally-available uploads are FIFA-game simulations).
-- Idempotent — safe to re-run.
-- =========================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS highlights_url text NOT NULL DEFAULT '';

-- Let admins write matches (to set highlights_url). RLS still gates it to admins;
-- the existing "matches public read" policy keeps reads open for everyone, and
-- the match-sync job uses service_role (bypasses RLS), so scoring is unaffected.
GRANT UPDATE ON public.matches TO authenticated;

DROP POLICY IF EXISTS "admins manage matches" ON public.matches;
CREATE POLICY "admins manage matches" ON public.matches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the one verified real, Nepal-playable highlight we have: Mexico 2-0 South
-- Africa from DD India (Doordarshan, India's public broadcaster). Real footage,
-- available in 249 countries incl. NP. Other matches are set from the Admin page.
UPDATE public.matches m
   SET highlights_url = 'https://www.youtube.com/watch?v=DjYkkRPqV18'
  FROM public.teams a, public.teams b
 WHERE m.team_a_id = a.id
   AND m.team_b_id = b.id
   AND a.code = 'MEX'
   AND b.code = 'RSA'
   AND COALESCE(m.highlights_url, '') = '';
