CREATE TABLE public.ai_visit_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  filter_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  content text NOT NULL,
  model text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_visit_insights TO authenticated;
GRANT ALL ON public.ai_visit_insights TO service_role;
ALTER TABLE public.ai_visit_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff in company can view insights" ON public.ai_visit_insights
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));
CREATE POLICY "Staff in company can insert insights" ON public.ai_visit_insights
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Admins can delete insights" ON public.ai_visit_insights
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_ai_visit_insights_company_recent ON public.ai_visit_insights(company_id, generated_at DESC);