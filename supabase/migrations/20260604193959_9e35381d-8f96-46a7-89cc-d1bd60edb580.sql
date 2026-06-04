
CREATE TABLE public.ai_visit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  location text,
  raw_notes text NOT NULL,
  tone text NOT NULL DEFAULT 'formal' CHECK (tone IN ('formal','concise','detailed')),
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','bn')),
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_at timestamptz,
  ai_generated boolean NOT NULL DEFAULT true,
  tasks_created_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_visit_reports_company_idx ON public.ai_visit_reports (company_id, visit_date DESC);
CREATE INDEX ai_visit_reports_user_idx ON public.ai_visit_reports (user_id, visit_date DESC);
CREATE INDEX ai_visit_reports_account_idx ON public.ai_visit_reports (account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_visit_reports TO authenticated;
GRANT ALL ON public.ai_visit_reports TO service_role;

ALTER TABLE public.ai_visit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_visit_reports_select" ON public.ai_visit_reports
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "ai_visit_reports_insert" ON public.ai_visit_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));

CREATE POLICY "ai_visit_reports_update_own" ON public.ai_visit_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_visit_reports_update_staff" ON public.ai_visit_reports
  FOR UPDATE TO authenticated
  USING (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  WITH CHECK (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()));

CREATE POLICY "ai_visit_reports_delete" ON public.ai_visit_reports
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE TRIGGER ai_visit_reports_touch
  BEFORE UPDATE ON public.ai_visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_visit_reports;
