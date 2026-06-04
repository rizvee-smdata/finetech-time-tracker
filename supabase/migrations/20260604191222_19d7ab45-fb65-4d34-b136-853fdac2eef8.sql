-- 1. expenses: rejection_reason
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 2. visit_reports
CREATE TABLE IF NOT EXISTS public.visit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  summary_text text,
  tasks_completed int NOT NULL DEFAULT 0,
  visits_done int NOT NULL DEFAULT 0,
  clients_visited jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  manager_comment text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_reports TO authenticated;
GRANT ALL ON public.visit_reports TO service_role;

ALTER TABLE public.visit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_reports_select" ON public.visit_reports
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "visit_reports_insert" ON public.visit_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));

CREATE POLICY "visit_reports_update_own" ON public.visit_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "visit_reports_update_manager" ON public.visit_reports
  FOR UPDATE TO authenticated
  USING (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  WITH CHECK (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()));

CREATE POLICY "visit_reports_delete" ON public.visit_reports
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR (user_id = auth.uid() AND status = 'pending'));

CREATE TRIGGER visit_reports_touch BEFORE UPDATE ON public.visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS visit_reports_company_idx ON public.visit_reports (company_id);
CREATE INDEX IF NOT EXISTS visit_reports_status_idx ON public.visit_reports (status);
CREATE INDEX IF NOT EXISTS visit_reports_date_idx ON public.visit_reports (report_date DESC);

-- 3. approval_logs
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL,
  comments text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.approval_logs TO authenticated;
GRANT ALL ON public.approval_logs TO service_role;

ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_logs_select" ON public.approval_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
    OR actor_id = auth.uid()
  );

CREATE POLICY "approval_logs_insert" ON public.approval_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND is_company_member(auth.uid(), company_id)
  );

CREATE INDEX IF NOT EXISTS approval_logs_entity_idx ON public.approval_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS approval_logs_company_idx ON public.approval_logs (company_id, created_at DESC);

-- 4. Realtime
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.visit_reports REPLICA IDENTITY FULL;
ALTER TABLE public.approval_logs REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_visits; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_checkins; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;