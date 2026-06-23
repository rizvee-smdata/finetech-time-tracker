
CREATE TABLE IF NOT EXISTS public.crm_oems (
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
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oems TO authenticated;
GRANT ALL ON public.crm_oems TO service_role;

ALTER TABLE public.crm_oems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oems view by company members" ON public.crm_oems
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "oems manage by staff" ON public.crm_oems
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)));

CREATE TRIGGER crm_oems_touch_updated_at BEFORE UPDATE ON public.crm_oems
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.crm_products
  ADD COLUMN IF NOT EXISTS oem_id uuid REFERENCES public.crm_oems(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_products_oem_id_idx ON public.crm_products(oem_id);

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS oem_id uuid REFERENCES public.crm_oems(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.crm_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_leads_oem_id_idx ON public.crm_leads(oem_id);
CREATE INDEX IF NOT EXISTS crm_leads_product_id_idx ON public.crm_leads(product_id);
