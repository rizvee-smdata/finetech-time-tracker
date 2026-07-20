
-- =========================================================================
-- 1. app_config (singleton) so we stop hardcoding Lovable URLs in DB funcs
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.app_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  base_url text NOT NULL DEFAULT 'https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app',
  supabase_functions_url text NOT NULL DEFAULT 'https://ejiaxmvzolqgfcawgyvl.supabase.co/functions/v1',
  supabase_anon_key text NOT NULL DEFAULT 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI',
  app_name text NOT NULL DEFAULT 'Lavisho TT',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_config_read_authenticated" ON public.app_config;
CREATE POLICY "app_config_read_authenticated" ON public.app_config
  FOR SELECT TO authenticated USING (true);
INSERT INTO public.app_config (id) VALUES (true) ON CONFLICT DO NOTHING;

-- =========================================================================
-- 2. Rewrite email_queue_dispatch to read base_url from app_config
-- =========================================================================
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE _base text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  SELECT base_url INTO _base FROM public.app_config WHERE id = true;

  PERFORM net.http_post(
    url := _base || '/lovable/email/queue/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$;

-- =========================================================================
-- 3. Rewrite wa_notify_deal_won to read from app_config
-- =========================================================================
CREATE OR REPLACE FUNCTION public.wa_notify_deal_won()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cfg RECORD;
BEGIN
  IF NEW.stage <> 'won' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage = 'won' THEN RETURN NEW; END IF;

  BEGIN
    SELECT supabase_functions_url, supabase_anon_key INTO _cfg FROM public.app_config WHERE id = true;
    PERFORM net.http_post(
      url := _cfg.supabase_functions_url || '/send-deal-won-notification',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey', _cfg.supabase_anon_key
      ),
      body := jsonb_build_object('lead_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 4. handle_new_user — remove first-user auto super-admin
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  -- Default role only; super-admin is now granted explicitly by another
  -- super-admin via manage_super_admins, never by signup order.
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- =========================================================================
-- 5. Per-tenant plan tracking + limits
-- =========================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='plan') THEN
    ALTER TABLE public.companies ADD COLUMN plan text NOT NULL DEFAULT 'trial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='plan_started_at') THEN
    ALTER TABLE public.companies ADD COLUMN plan_started_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text PRIMARY KEY,
  max_users integer NOT NULL,
  max_leads integer NOT NULL,
  max_storage_mb integer NOT NULL,
  ai_calls_per_month integer NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_limits_read" ON public.plan_limits;
CREATE POLICY "plan_limits_read" ON public.plan_limits FOR SELECT TO authenticated USING (true);

INSERT INTO public.plan_limits (plan, max_users, max_leads, max_storage_mb, ai_calls_per_month, features) VALUES
  ('trial',        5,    500,    500,    1000,  '{"custom_domain":false,"advanced_bi":false}'::jsonb),
  ('starter',      10,   2000,   2000,   3000,  '{"custom_domain":false,"advanced_bi":false}'::jsonb),
  ('professional', 50,   20000,  20000,  20000, '{"custom_domain":true,"advanced_bi":false}'::jsonb),
  ('enterprise',   9999, 999999, 999999, 999999,'{"custom_domain":true,"advanced_bi":true}'::jsonb)
ON CONFLICT (plan) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_plan_limit(_company uuid, _resource text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _plan text;
  _limits public.plan_limits%ROWTYPE;
  _used int := 0;
  _cap int := 0;
BEGIN
  SELECT plan INTO _plan FROM public.companies WHERE id = _company;
  IF _plan IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown_company'); END IF;
  SELECT * INTO _limits FROM public.plan_limits WHERE plan = _plan;
  IF _limits IS NULL THEN RETURN jsonb_build_object('ok', true, 'used', 0, 'cap', null); END IF;

  IF _resource = 'users' THEN
    SELECT COUNT(*) INTO _used FROM public.company_members WHERE company_id = _company;
    _cap := _limits.max_users;
  ELSIF _resource = 'leads' THEN
    SELECT COUNT(*) INTO _used FROM public.crm_leads WHERE company_id = _company AND deleted_at IS NULL;
    _cap := _limits.max_leads;
  ELSE
    RETURN jsonb_build_object('ok', true, 'used', 0, 'cap', null);
  END IF;

  RETURN jsonb_build_object(
    'ok', _used < _cap,
    'plan', _plan,
    'resource', _resource,
    'used', _used,
    'cap', _cap
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) TO authenticated;

-- =========================================================================
-- 6. Trial signup rate limit
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.trial_signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text,
  email text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trial_signup_ip ON public.trial_signup_attempts (ip_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_signup_email ON public.trial_signup_attempts (email, attempted_at DESC);
GRANT SELECT, INSERT ON public.trial_signup_attempts TO service_role;
GRANT ALL ON public.trial_signup_attempts TO service_role;
ALTER TABLE public.trial_signup_attempts ENABLE ROW LEVEL SECURITY;
-- No public policies; only service role writes/reads via server functions.
