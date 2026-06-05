
CREATE TABLE public.meeting_prep_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tms_tasks(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  rep_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | ready | failed
  brief jsonb,
  aggregated_data jsonb,
  error text,
  scheduled_at timestamptz,
  generated_at timestamptz,
  alerted_rep_at timestamptz,
  prepared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

CREATE INDEX idx_meeting_prep_company ON public.meeting_prep_briefs(company_id);
CREATE INDEX idx_meeting_prep_rep ON public.meeting_prep_briefs(rep_id);
CREATE INDEX idx_meeting_prep_task ON public.meeting_prep_briefs(task_id);
CREATE INDEX idx_meeting_prep_scheduled ON public.meeting_prep_briefs(scheduled_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_prep_briefs TO authenticated;
GRANT ALL ON public.meeting_prep_briefs TO service_role;

ALTER TABLE public.meeting_prep_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rep_view_own_brief" ON public.meeting_prep_briefs
  FOR SELECT TO authenticated
  USING (
    rep_id = auth.uid()
    OR public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "rep_update_own_brief" ON public.meeting_prep_briefs
  FOR UPDATE TO authenticated
  USING (
    rep_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    rep_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "insert_own_brief" ON public.meeting_prep_briefs
  FOR INSERT TO authenticated
  WITH CHECK (
    rep_id = auth.uid()
    OR public.is_staff(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER meeting_prep_briefs_set_updated_at
  BEFORE UPDATE ON public.meeting_prep_briefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Schedule the cron every minute. URL points to the meeting-prep-cron edge function.
SELECT cron.schedule(
  'meeting-prep-cron-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ejiaxmvzolqgfcawgyvl.supabase.co/functions/v1/meeting-prep-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWF4bXZ6b2xxZ2ZjYXdneXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MjkyODIsImV4cCI6MjA5NDAwNTI4Mn0.U1TzN1YvPsFA93LhcvlIwcVOvV_q7sYart_6XMIwbiI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
