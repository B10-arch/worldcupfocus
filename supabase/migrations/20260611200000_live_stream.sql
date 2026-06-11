-- Admin-managed live stream for the Watch page. A single-row table holding the
-- embed URL + title. Any logged-in user can read it (to watch); only admins can
-- change it. The admin is responsible for using a source they are licensed to
-- embed (e.g. an official FIFA+/broadcaster player) — not unauthorized re-streams.

CREATE TABLE IF NOT EXISTS public.live_stream (
  id boolean PRIMARY KEY DEFAULT true,
  embed_url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_stream_single_row CHECK (id = true)
);

INSERT INTO public.live_stream (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.live_stream TO authenticated, anon;
GRANT ALL ON public.live_stream TO service_role;
ALTER TABLE public.live_stream ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_stream readable by authenticated" ON public.live_stream;
CREATE POLICY "live_stream readable by authenticated" ON public.live_stream
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins manage live_stream" ON public.live_stream;
CREATE POLICY "admins manage live_stream" ON public.live_stream
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_live_stream()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_live_stream ON public.live_stream;
CREATE TRIGGER trg_touch_live_stream
  BEFORE UPDATE ON public.live_stream
  FOR EACH ROW EXECUTE FUNCTION public.touch_live_stream();
