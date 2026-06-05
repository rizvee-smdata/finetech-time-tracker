
CREATE TABLE IF NOT EXISTS public.narrative_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ceo','sales','ops','custom')),
  week_start date NOT NULL,
  week_end date NOT NULL,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','bn')),
  title text NOT NULL,
  summary text,
  body_md text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_url text,
  delivered_channels text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_narrative_reports_company_week
  ON public.narrative_reports(company_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_narrative_reports_role
  ON public.narrative_reports(company_id, role, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_reports TO authenticated;
GRANT ALL ON public.narrative_reports TO service_role;

ALTER TABLE public.narrative_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narratives_select_members" ON public.narrative_reports
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "narratives_modify_staff" ON public.narrative_reports
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.narrative_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ceo','sales','ops','custom')),
  enabled boolean NOT NULL DEFAULT true,
  role_description text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  delivery_time time NOT NULL DEFAULT '07:00',
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','bn')),
  custom_kpis text[] NOT NULL DEFAULT '{}',
  whatsapp_recipients text[] NOT NULL DEFAULT '{}',
  email_recipients text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.narrative_settings TO authenticated;
GRANT ALL ON public.narrative_settings TO service_role;

ALTER TABLE public.narrative_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "narrative_settings_select" ON public.narrative_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "narrative_settings_modify_staff" ON public.narrative_settings
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_updated_at_narratives()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_narrative_reports_updated ON public.narrative_reports;
CREATE TRIGGER trg_narrative_reports_updated BEFORE UPDATE ON public.narrative_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_narratives();

DROP TRIGGER IF EXISTS trg_narrative_settings_updated ON public.narrative_settings;
CREATE TRIGGER trg_narrative_settings_updated BEFORE UPDATE ON public.narrative_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_narratives();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='narratives-weekly') THEN
    PERFORM cron.unschedule('narratives-weekly');
  END IF;
END $$;

SELECT cron.schedule(
  'narratives-weekly',
  '0 1 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://project--4b057a3a-1c4d-4b4b-afb2-b4ad1f521b36.lovable.app/api/public/hooks/narratives-weekly-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
