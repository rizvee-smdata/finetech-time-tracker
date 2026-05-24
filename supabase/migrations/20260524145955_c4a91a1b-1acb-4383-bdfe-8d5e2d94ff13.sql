GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.crm_can_view_lead(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tms_can_view_task(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tms_can_view_project(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tms_can_manage_project(uuid, uuid) TO authenticated, anon;