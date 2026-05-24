CREATE TABLE IF NOT EXISTS public.crm_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  period_month date NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, period_month)
);

ALTER TABLE public.crm_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_targets_select ON public.crm_targets
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND (is_staff(auth.uid()) OR user_id = auth.uid()))
);

CREATE POLICY crm_targets_manage ON public.crm_targets
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
);

CREATE TRIGGER set_crm_targets_updated_at
BEFORE UPDATE ON public.crm_targets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_crm_targets_company_period ON public.crm_targets(company_id, period_month);
CREATE INDEX IF NOT EXISTS idx_crm_targets_user_period ON public.crm_targets(user_id, period_month);