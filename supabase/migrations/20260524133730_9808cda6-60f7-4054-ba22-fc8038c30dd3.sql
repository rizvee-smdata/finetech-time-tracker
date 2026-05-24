
CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.crm_saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crm_saved_views_company_idx ON public.crm_saved_views(company_id);
CREATE INDEX crm_saved_views_user_idx ON public.crm_saved_views(user_id);

ALTER TABLE public.crm_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_views_select" ON public.crm_saved_views FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid() OR (is_shared AND is_company_member(auth.uid(), company_id)));
CREATE POLICY "crm_views_insert" ON public.crm_saved_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (has_role(auth.uid(), 'admin'::app_role) OR is_company_member(auth.uid(), company_id)));
CREATE POLICY "crm_views_update" ON public.crm_saved_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "crm_views_delete" ON public.crm_saved_views FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_updated_at_crm_saved_views BEFORE UPDATE ON public.crm_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
