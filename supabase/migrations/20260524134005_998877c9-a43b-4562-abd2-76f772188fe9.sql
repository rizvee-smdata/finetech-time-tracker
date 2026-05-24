
CREATE TABLE public.crm_capture_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  default_assignee UUID,
  default_source TEXT NOT NULL DEFAULT 'inbound',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crm_capture_keys_company_idx ON public.crm_capture_keys(company_id);
CREATE INDEX crm_capture_keys_token_idx ON public.crm_capture_keys(token);

ALTER TABLE public.crm_capture_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_capture_select" ON public.crm_capture_keys FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));
CREATE POLICY "crm_capture_manage" ON public.crm_capture_keys FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE TRIGGER set_updated_at_crm_capture_keys BEFORE UPDATE ON public.crm_capture_keys
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
