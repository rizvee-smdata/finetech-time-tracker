
REVOKE ALL ON FUNCTION public.evaluate_lead_routing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_lead_routing(uuid) TO service_role;
