
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='copilot-anomalies-daily') THEN
    PERFORM cron.unschedule('copilot-anomalies-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='copilot-scheduled-hourly') THEN
    PERFORM cron.unschedule('copilot-scheduled-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'copilot-anomalies-daily',
  '0 0 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/api/public/hooks/copilot-anomalies-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'copilot-scheduled-hourly',
  '15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/api/public/hooks/copilot-scheduled-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
