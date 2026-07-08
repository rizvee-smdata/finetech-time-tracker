
-- Custom lead field definitions per company
CREATE TABLE public.crm_custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number')),
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_custom_field_defs TO authenticated;
GRANT ALL ON public.crm_custom_field_defs TO service_role;

ALTER TABLE public.crm_custom_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view custom field defs"
  ON public.crm_custom_field_defs FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Staff can manage custom field defs"
  ON public.crm_custom_field_defs FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER trg_crm_custom_field_defs_updated_at
  BEFORE UPDATE ON public.crm_custom_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add custom_fields JSON storage to leads
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
