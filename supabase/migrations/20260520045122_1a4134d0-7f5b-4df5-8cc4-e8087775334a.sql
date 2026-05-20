DROP POLICY IF EXISTS "tms_tasks_insert" ON public.tms_tasks;
CREATE POLICY "tms_tasks_insert" ON public.tms_tasks
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_company_member(auth.uid(), company_id)
);