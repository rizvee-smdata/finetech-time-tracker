
-- Allow assigned expense approvers (any role) to view and update expenses of their assigned reps.

CREATE OR REPLACE FUNCTION public.is_expense_approver_for(_approver uuid, _rep uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.expense_approver_assignments
    WHERE approver_id = _approver AND rep_id = _rep
  );
$$;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR user_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
    OR public.is_expense_approver_for(auth.uid(), user_id)
  );

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (user_id = auth.uid() AND status IN ('draft','rejected'))
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
    OR public.is_expense_approver_for(auth.uid(), user_id)
  );
