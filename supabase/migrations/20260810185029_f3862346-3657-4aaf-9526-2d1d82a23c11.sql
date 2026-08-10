DROP POLICY IF EXISTS narratives_modify_staff ON public.narrative_reports;
DROP POLICY IF EXISTS narratives_select_members ON public.narrative_reports;

CREATE POLICY narratives_select_members ON public.narrative_reports
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid())
);

CREATE POLICY narratives_modify_staff ON public.narrative_reports
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
);