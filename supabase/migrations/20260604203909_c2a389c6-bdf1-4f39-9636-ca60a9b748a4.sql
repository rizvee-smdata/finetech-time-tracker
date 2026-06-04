-- 1. profiles.whatsapp_number
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_number ON public.profiles(whatsapp_number) WHERE whatsapp_number IS NOT NULL;

-- 2. whatsapp_settings
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  morning_briefing_enabled BOOLEAN NOT NULL DEFAULT true,
  morning_briefing_time TIME NOT NULL DEFAULT '08:00:00',
  deal_won_rep_enabled BOOLEAN NOT NULL DEFAULT true,
  deal_won_manager_enabled BOOLEAN NOT NULL DEFAULT true,
  inbound_commands_enabled BOOLEAN NOT NULL DEFAULT true,
  expense_capture_enabled BOOLEAN NOT NULL DEFAULT true,
  followup_threshold_days INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_settings_staff_read" ON public.whatsapp_settings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wa_settings_staff_write" ON public.whatsapp_settings FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_wa_settings_updated_at BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. whatsapp_templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  body TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_tpl_staff_read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wa_tpl_staff_write" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_wa_tpl_updated_at BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. whatsapp_message_log
CREATE TABLE IF NOT EXISTS public.whatsapp_message_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  template_key TEXT,
  phone TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed','received')),
  error TEXT,
  wati_message_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.whatsapp_message_log TO authenticated;
GRANT ALL ON public.whatsapp_message_log TO service_role;
ALTER TABLE public.whatsapp_message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_log_staff_read" ON public.whatsapp_message_log FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "wa_log_self_read" ON public.whatsapp_message_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_wa_log_company_created ON public.whatsapp_message_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_log_user_created ON public.whatsapp_message_log(user_id, created_at DESC);

-- 5. Deal-won trigger -> call edge function via pg_net (best effort; no-op if pg_net missing)
CREATE OR REPLACE FUNCTION public.wa_notify_deal_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url TEXT;
BEGIN
  IF NEW.stage <> 'won' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.stage = 'won' THEN RETURN NEW; END IF;

  BEGIN
    _url := 'https://ejiaxmvzolqgfcawgyvl.supabase.co/functions/v1/send-deal-won-notification';
    PERFORM net.http_post(
      url := _url,
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
      body := jsonb_build_object('lead_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- pg_net not available or other failure; ignore
    NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_deal_won ON public.crm_leads;
CREATE TRIGGER trg_wa_deal_won
  AFTER INSERT OR UPDATE OF stage ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.wa_notify_deal_won();

-- 6. Cron: morning briefing 02:00 UTC weekdays (Mon-Sat = 1-6)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('wa-morning-briefing') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='wa-morning-briefing');
    PERFORM cron.schedule(
      'wa-morning-briefing',
      '0 2 * * 1-6',
      $cron$
      SELECT net.http_post(
        url := 'https://ejiaxmvzolqgfcawgyvl.supabase.co/functions/v1/send-morning-briefing',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;