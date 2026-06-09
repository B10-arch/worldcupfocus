
CREATE OR REPLACE FUNCTION public.current_npt_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ((now() AT TIME ZONE 'UTC') + interval '5 hours 45 minutes')::date;
$$;
