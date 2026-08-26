
-- attribution_touchpoints: scope staff access to own company
DROP POLICY IF EXISTS attr_touch_select_staff ON public.attribution_touchpoints;
CREATE POLICY attr_touch_select_staff ON public.attribution_touchpoints
FOR SELECT TO authenticated
USING (
  (public.is_company_member(auth.uid(), company_id)
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')))
  OR EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = attribution_touchpoints.lead_id
      AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS attr_touch_insert_staff ON public.attribution_touchpoints;
CREATE POLICY attr_touch_insert_staff ON public.attribution_touchpoints
FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

-- custom_object_defs
DROP POLICY IF EXISTS co_defs_manage_admin ON public.custom_object_defs;
CREATE POLICY co_defs_manage_admin ON public.custom_object_defs
FOR ALL TO authenticated
USING (
  public.is_company_member(auth.uid(), company_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
)
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

-- custom_object_field_defs (scoped via parent object's company)
DROP POLICY IF EXISTS co_fields_manage_admin ON public.custom_object_field_defs;
CREATE POLICY co_fields_manage_admin ON public.custom_object_field_defs
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.custom_object_defs d
    WHERE d.id = custom_object_field_defs.object_id
      AND public.is_company_member(auth.uid(), d.company_id)
  )
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.custom_object_defs d
    WHERE d.id = custom_object_field_defs.object_id
      AND public.is_company_member(auth.uid(), d.company_id)
  )
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
);

-- custom_object_records update
DROP POLICY IF EXISTS co_records_update ON public.custom_object_records;
CREATE POLICY co_records_update ON public.custom_object_records
FOR UPDATE TO authenticated
USING (
  public.is_company_member(auth.uid(), company_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR owner_id = auth.uid())
)
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR owner_id = auth.uid())
);
