
DO $$ BEGIN
  CREATE TYPE public.target_scope AS ENUM ('user','territory','company');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.target_metric AS ENUM ('revenue','visits','new_leads','won_leads','quotes_sent','meetings');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.target_period_kind AS ENUM ('monthly','quarterly','yearly','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope public.target_scope NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  territory_id uuid REFERENCES public.crm_territories(id) ON DELETE CASCADE,
  metric public.target_metric NOT NULL,
  period_kind public.target_period_kind NOT NULL DEFAULT 'monthly',
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric NOT NULL CHECK (target_value > 0),
  currency text NOT NULL DEFAULT 'BDT',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (
    (scope = 'user' AND user_id IS NOT NULL AND territory_id IS NULL) OR
    (scope = 'territory' AND territory_id IS NOT NULL AND user_id IS NULL) OR
    (scope = 'company' AND user_id IS NULL AND territory_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_targets_company_period ON public.targets(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_targets_user ON public.targets(user_id);
CREATE INDEX IF NOT EXISTS idx_targets_territory ON public.targets(territory_id);

ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view targets in their company" ON public.targets
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Staff can insert targets" ON public.targets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update targets" ON public.targets
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can delete targets" ON public.targets
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER targets_set_updated_at
  BEFORE UPDATE ON public.targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
