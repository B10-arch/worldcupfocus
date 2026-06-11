-- Schedule the sync-matches edge function to run every 3 minutes via pg_cron,
-- so match scores/status and pool points update automatically during the
-- tournament. The shared secret is read from Vault (set once, out of band, via:
--   select vault.create_secret('<value>', 'sync_matches_secret');
-- ) so no secret is stored in version control.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: drop a prior schedule of the same name before (re)creating.
DO $$
BEGIN
  PERFORM cron.unschedule('sync-matches');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sync-matches',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wticnahezjugepbyzlaq.supabase.co/functions/v1/sync-matches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_matches_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
