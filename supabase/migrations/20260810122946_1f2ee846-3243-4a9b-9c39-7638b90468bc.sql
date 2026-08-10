
ALTER TABLE public.webhook_deliveries ADD COLUMN IF NOT EXISTS request_id bigint;

CREATE OR REPLACE FUNCTION public.dispatch_webhooks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  ts text;
  body text;
  sig text;
  req_id bigint;
  n integer := 0;
BEGIN
  -- 1) Reconcile in-flight requests
  FOR r IN
    SELECT d.id, d.request_id, d.attempts
    FROM public.webhook_deliveries d
    WHERE d.status = 'sent' AND d.request_id IS NOT NULL
    LIMIT 100
  LOOP
    UPDATE public.webhook_deliveries d
    SET status = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN 'delivered'
                      WHEN d.attempts >= 5 THEN 'failed'
                      ELSE 'pending' END,
        response_code = resp.status_code,
        response_body = left(coalesce(resp.content, ''), 500),
        delivered_at = CASE WHEN resp.status_code BETWEEN 200 AND 299 THEN now() ELSE NULL END,
        next_attempt_at = now() + (power(4, least(d.attempts, 4)) || ' minutes')::interval
    FROM net._http_response resp
    WHERE d.id = r.id AND resp.id = r.request_id;
  END LOOP;

  -- 2) Send pending deliveries
  FOR r IN
    SELECT d.id, d.event, d.payload, d.attempts, e.url, e.secret
    FROM public.webhook_deliveries d
    JOIN public.webhook_endpoints e ON e.id = d.endpoint_id
    WHERE d.status = 'pending' AND d.next_attempt_at <= now() AND e.is_active
    ORDER BY d.created_at
    LIMIT 50
  LOOP
    ts := extract(epoch from now())::bigint::text;
    body := jsonb_build_object('event', r.event, 'data', r.payload, 'id', r.id)::text;
    sig := encode(extensions.hmac(ts || '.' || body, r.secret, 'sha256'), 'hex');

    SELECT net.http_post(
      url := r.url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-event', r.event,
        'x-webhook-timestamp', ts,
        'x-webhook-signature', sig
      ),
      body := body::jsonb,
      timeout_milliseconds := 10000
    ) INTO req_id;

    UPDATE public.webhook_deliveries
    SET status = 'sent', attempts = attempts + 1, request_id = req_id
    WHERE id = r.id;
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_webhooks() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'webhook-dispatch-minutely') THEN
    PERFORM cron.unschedule('webhook-dispatch-minutely');
  END IF;
END $$;

SELECT cron.schedule('webhook-dispatch-minutely', '* * * * *', $$SELECT public.dispatch_webhooks();$$);
