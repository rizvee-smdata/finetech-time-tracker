DROP POLICY IF EXISTS "tms_projects_select" ON public.tms_projects;
DROP POLICY IF EXISTS "tms_projects_insert" ON public.tms_projects;
DROP POLICY IF EXISTS "tms_projects_update" ON public.tms_projects;
DROP POLICY IF EXISTS "tms_projects_delete" ON public.tms_projects;

CREATE POLICY "tms_projects_select"
ON public.tms_projects
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_company_member(auth.uid(), company_id)
    AND (
      visibility = 'public'::tms_project_visibility
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.tms_project_members m
        WHERE m.project_id = tms_projects.id
          AND m.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "tms_projects_insert"
ON public.tms_projects
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_company_member(auth.uid(), company_id)
);

CREATE POLICY "tms_projects_update"
ON public.tms_projects
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR owner_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR owner_id = auth.uid()
);

CREATE POLICY "tms_projects_delete"
ON public.tms_projects
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR owner_id = auth.uid()
);