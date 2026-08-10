CREATE TABLE IF NOT EXISTS public.crm_approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  discount_threshold_pct numeric not null default 15,
  amount_threshold numeric,
  approver_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_approval_rules TO authenticated;
GRANT ALL ON public.crm_approval_rules TO service_role;

ALTER TABLE public.crm_approval_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read approval rules" ON public.crm_approval_rules
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "admins manage approval rules" ON public.crm_approval_rules
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(),'admin') OR public.is_super_admin(auth.uid())));

CREATE TRIGGER crm_approval_rules_touch BEFORE UPDATE ON public.crm_approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();