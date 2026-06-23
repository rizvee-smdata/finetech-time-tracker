
ALTER VIEW public.visits_needing_account_review SET (security_invoker = on);
ALTER VIEW public.visit_account_migration_summary SET (security_invoker = on);
REVOKE EXECUTE ON FUNCTION public.reports_to_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reports_to_user(uuid, uuid) TO authenticated;
