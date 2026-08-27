CREATE POLICY "Super admins can manage custom field defs"
ON public.crm_custom_field_defs
FOR ALL
TO authenticated
USING (public.is_saas_super_admin() OR public.is_super_admin(auth.uid()))
WITH CHECK (public.is_saas_super_admin() OR public.is_super_admin(auth.uid()));