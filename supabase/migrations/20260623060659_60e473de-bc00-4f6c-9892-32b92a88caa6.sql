DROP POLICY IF EXISTS "oems manage by company members" ON public.crm_oems;
DROP POLICY IF EXISTS "oems manage by authorized users" ON public.crm_oems;

ALTER TABLE public.crm_oems
  ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE POLICY "oems manage by authorized users" ON public.crm_oems
  FOR ALL TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );