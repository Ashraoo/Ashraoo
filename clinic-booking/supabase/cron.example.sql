-- Runs the WhatsApp worker every 5 minutes from inside Supabase (works on the free plan).
-- 1. Dashboard → Database → Extensions: enable pg_cron and pg_net.
-- 2. Replace the URL and the secret below (same value as CRON_SECRET), then run this in the SQL editor.

select vault.create_secret('change-me-to-a-long-random-string', 'cron_secret');

select cron.schedule(
  'send-whatsapp-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://your-domain.com/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- To stop it: select cron.unschedule('send-whatsapp-reminders');
