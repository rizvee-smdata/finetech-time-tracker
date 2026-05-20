CREATE OR REPLACE FUNCTION public.tms_can_view_task(_user uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tms_tasks t
    WHERE t.id = _task_id
      AND (
        public.has_role(_user, 'admin'::app_role)
        OR (
          public.is_company_member(_user, t.company_id)
          AND (
            NOT t.is_private
            OR t.created_by = _user
            OR EXISTS (
              SELECT 1
              FROM public.tms_task_assignees a
              WHERE a.task_id = t.id AND a.user_id = _user
            )
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "tms_tasks_select" ON public.tms_tasks;
CREATE POLICY "tms_tasks_select"
ON public.tms_tasks
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_company_member(auth.uid(), company_id)
    AND (
      NOT is_private
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.tms_task_assignees a
        WHERE a.task_id = tms_tasks.id AND a.user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "tms_tasks_update" ON public.tms_tasks;
CREATE POLICY "tms_tasks_update"
ON public.tms_tasks
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_company_member(auth.uid(), company_id)
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.tms_task_assignees a
        WHERE a.task_id = tms_tasks.id AND a.user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "tms_tasks_delete" ON public.tms_tasks;
CREATE POLICY "tms_tasks_delete"
ON public.tms_tasks
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "tms_status_select" ON public.tms_task_statuses;
CREATE POLICY "tms_status_select"
ON public.tms_task_statuses
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_company_member(auth.uid(), company_id)
);