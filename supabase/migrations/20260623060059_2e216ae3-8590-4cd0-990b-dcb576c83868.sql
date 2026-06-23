
DROP POLICY IF EXISTS "oems manage by staff" ON public.crm_oems;

CREATE POLICY "oems manage by company members" ON public.crm_oems
  FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
