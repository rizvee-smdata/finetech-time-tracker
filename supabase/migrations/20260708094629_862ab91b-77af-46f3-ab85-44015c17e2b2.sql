
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-sync-30min') THEN
    PERFORM cron.unschedule('gmail-sync-30min');
  END IF;
END $$;

SELECT cron.schedule(
  'gmail-sync-30min',
  '*/30 2-14 * * 0,1,2,3,4',
  $$
  SELECT net.http_post(
    url := 'https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/api/public/hooks/gmail-sync',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
