DROP POLICY IF EXISTS "tms_tasks_update" ON public.tms_tasks;

CREATE POLICY "tms_tasks_update" ON public.tms_tasks
FOR UPDATE TO authenticated
USING (
  is_company_member(auth.uid(), company_id)
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tms_task_assignees a
      WHERE a.task_id = tms_tasks.id AND a.user_id = auth.uid()
    )
  )
);