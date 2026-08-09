DROP POLICY IF EXISTS "app_config_read_authenticated" ON public.app_config;
CREATE POLICY "app_config_read_super_admin" ON public.app_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "narrative_settings_select" ON public.narrative_settings;
CREATE POLICY "narrative_settings_select_staff" ON public.narrative_settings
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Requester can view own trial request" ON public.trial_requests;
CREATE POLICY "Requester can view own verified trial request" ON public.trial_requests
  FOR SELECT TO authenticated
  USING (
    email_verified_at IS NOT NULL
    AND lower(work_email) = lower((SELECT users.email FROM auth.users WHERE users.id = auth.uid())::text)
  );

REVOKE ALL ON public.trial_signup_attempts FROM anon, authenticated;
GRANT ALL ON public.trial_signup_attempts TO service_role;
ALTER TABLE public.trial_signup_attempts ENABLE ROW LEVEL SECURITY;