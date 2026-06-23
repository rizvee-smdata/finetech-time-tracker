CREATE TABLE public.visit_analytics_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  stale_threshold_days int NOT NULL DEFAULT 30,
  strategic_tiers text[] NOT NULL DEFAULT ARRAY['strategic'],
  weekly_report_recipients uuid[] NOT NULL DEFAULT '{}',
  weekly_report_enabled boolean NOT NULL DEFAULT true,
  stale_alert_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_analytics_settings TO authenticated;
GRANT ALL ON public.visit_analytics_settings TO service_role;
ALTER TABLE public.visit_analytics_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff in company can view settings" ON public.visit_analytics_settings
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));
CREATE POLICY "Staff in company can upsert settings" ON public.visit_analytics_settings
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER trg_visit_analytics_settings_updated
  BEFORE UPDATE ON public.visit_analytics_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.visit_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  days_since_visit int,
  fired_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.visit_alert_log TO authenticated;
GRANT ALL ON public.visit_alert_log TO service_role;
ALTER TABLE public.visit_alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff in company can view alert log" ON public.visit_alert_log
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));
CREATE INDEX idx_visit_alert_log_lookup ON public.visit_alert_log(company_id, account_id, alert_type, fired_at DESC);