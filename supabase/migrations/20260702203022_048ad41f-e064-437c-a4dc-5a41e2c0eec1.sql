
DROP POLICY IF EXISTS "Customers insert" ON public.customers;
DROP POLICY IF EXISTS "Customers update" ON public.customers;
DROP POLICY IF EXISTS "Customers delete" ON public.customers;

CREATE POLICY "Customers insert" ON public.customers FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NULL AND auth.uid() = created_by)
    OR (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "Customers update" ON public.customers FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_staff(auth.uid())
    OR auth.uid() = created_by
    OR (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "Customers delete" ON public.customers FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_staff(auth.uid())
    OR auth.uid() = created_by
  );
