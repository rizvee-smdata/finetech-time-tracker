DROP POLICY IF EXISTS "staff manage holidays" ON public.company_holidays;
CREATE POLICY "staff manage holidays" ON public.company_holidays
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
);