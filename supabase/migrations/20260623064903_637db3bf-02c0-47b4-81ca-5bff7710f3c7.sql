
CREATE TABLE public.crm_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_partners TO authenticated;
GRANT ALL ON public.crm_partners TO service_role;

ALTER TABLE public.crm_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and admins can view partners"
  ON public.crm_partners FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members and admins can manage partners"
  ON public.crm_partners FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX crm_partners_company_idx ON public.crm_partners(company_id, is_active);

CREATE TRIGGER crm_partners_touch BEFORE UPDATE ON public.crm_partners
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

ALTER TABLE public.crm_leads
  ADD COLUMN partner_id uuid REFERENCES public.crm_partners(id) ON DELETE SET NULL;

CREATE INDEX crm_leads_partner_idx ON public.crm_leads(partner_id) WHERE partner_id IS NOT NULL;
