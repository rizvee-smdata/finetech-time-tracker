
CREATE TABLE IF NOT EXISTS public.performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  revenue_target numeric(14,2) NOT NULL DEFAULT 0,
  revenue_actual numeric(14,2) NOT NULL DEFAULT 0,
  deals_target int NOT NULL DEFAULT 0,
  deals_actual int NOT NULL DEFAULT 0,
  visits_target int NOT NULL DEFAULT 0,
  visits_actual int NOT NULL DEFAULT 0,
  calls_target int NOT NULL DEFAULT 0,
  calls_actual int NOT NULL DEFAULT 0,
  demos_target int NOT NULL DEFAULT 0,
  demos_actual int NOT NULL DEFAULT 0,
  proposals_target int NOT NULL DEFAULT 0,
  proposals_actual int NOT NULL DEFAULT 0,
  overall_score numeric(5,2) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_snapshots TO authenticated;
GRANT ALL ON public.performance_snapshots TO service_role;

ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snap_select_own_or_staff" ON public.performance_snapshots
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "snap_write_staff" ON public.performance_snapshots
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE INDEX idx_snap_user_period ON public.performance_snapshots (user_id, period_start DESC);
CREATE INDEX idx_snap_company_period ON public.performance_snapshots (company_id, period_start DESC);

CREATE TRIGGER perf_snap_touch_updated_at BEFORE UPDATE ON public.performance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Function: compute KPIs for a user/period (live, called from app)
CREATE OR REPLACE FUNCTION public.compute_performance_kpis(
  _user uuid, _company uuid, _start date, _end date
)
RETURNS TABLE (
  revenue_actual numeric, deals_actual int, visits_actual int,
  calls_actual int, demos_actual int, proposals_actual int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT SUM(expected_value) FROM crm_leads
              WHERE assigned_to = _user AND company_id = _company
                AND stage = 'won' AND won_at::date BETWEEN _start AND _end), 0)::numeric AS revenue_actual,
    COALESCE((SELECT COUNT(*) FROM crm_leads
              WHERE assigned_to = _user AND company_id = _company
                AND stage = 'won' AND won_at::date BETWEEN _start AND _end), 0)::int AS deals_actual,
    COALESCE((SELECT COUNT(*) FROM visit_checkins
              WHERE user_id = _user AND company_id = _company
                AND checkin_time::date BETWEEN _start AND _end), 0)::int AS visits_actual,
    COALESCE((SELECT COUNT(*) FROM crm_lead_activities a
              JOIN crm_leads l ON l.id = a.lead_id
              WHERE a.user_id = _user AND l.company_id = _company
                AND a.activity_type = 'call'
                AND a.occurred_at::date BETWEEN _start AND _end), 0)::int AS calls_actual,
    COALESCE((SELECT COUNT(*) FROM crm_lead_activities a
              JOIN crm_leads l ON l.id = a.lead_id
              WHERE a.user_id = _user AND l.company_id = _company
                AND a.activity_type = 'demo'
                AND a.occurred_at::date BETWEEN _start AND _end), 0)::int AS demos_actual,
    COALESCE((SELECT COUNT(*) FROM crm_quotes q
              WHERE q.company_id = _company
                AND q.created_by = _user
                AND q.status IN ('sent','accepted')
                AND COALESCE(q.sent_at, q.created_at)::date BETWEEN _start AND _end), 0)::int AS proposals_actual;
$$;

GRANT EXECUTE ON FUNCTION public.compute_performance_kpis(uuid, uuid, date, date) TO authenticated;
