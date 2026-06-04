
-- =========================================================
-- Client Health Score module
-- =========================================================

-- 1) client_health_scores
CREATE TABLE public.client_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  assigned_rep_id uuid,
  score int NOT NULL DEFAULT 100,
  rag_status text NOT NULL DEFAULT 'green',
  last_visit_date date,
  last_visit_days int,
  open_deals_count int NOT NULL DEFAULT 0,
  open_deals_value numeric(14,2) NOT NULL DEFAULT 0,
  pending_followups int NOT NULL DEFAULT 0,
  score_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);
CREATE INDEX idx_chs_company_rag ON public.client_health_scores(company_id, rag_status, score);
CREATE INDEX idx_chs_rep ON public.client_health_scores(assigned_rep_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_health_scores TO authenticated;
GRANT ALL ON public.client_health_scores TO service_role;
ALTER TABLE public.client_health_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chs_select" ON public.client_health_scores FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND (is_staff(auth.uid()) OR assigned_rep_id = auth.uid()))
);
CREATE POLICY "chs_write_service" ON public.client_health_scores FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER chs_set_updated_at BEFORE UPDATE ON public.client_health_scores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) client_health_history (daily snapshots)
CREATE TABLE public.client_health_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  score int NOT NULL,
  rag_status text NOT NULL,
  calculated_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, calculated_on)
);
CREATE INDEX idx_chh_account_date ON public.client_health_history(account_id, calculated_on DESC);

GRANT SELECT, INSERT ON public.client_health_history TO authenticated;
GRANT ALL ON public.client_health_history TO service_role;
ALTER TABLE public.client_health_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chh_select" ON public.client_health_history FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_company_member(auth.uid(), company_id)
);

-- 3) client_health_rag_alerts
CREATE TABLE public.client_health_rag_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  assigned_rep_id uuid,
  from_rag text,
  to_rag text NOT NULL,
  score int NOT NULL,
  last_visit_days int,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chra_company_created ON public.client_health_rag_alerts(company_id, created_at DESC);

GRANT SELECT, UPDATE ON public.client_health_rag_alerts TO authenticated;
GRANT ALL ON public.client_health_rag_alerts TO service_role;
ALTER TABLE public.client_health_rag_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chra_select" ON public.client_health_rag_alerts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND (is_staff(auth.uid()) OR assigned_rep_id = auth.uid()))
);
CREATE POLICY "chra_ack" ON public.client_health_rag_alerts FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.client_health_rag_alerts;

-- 4) Compute RPC
CREATE OR REPLACE FUNCTION public.compute_client_health(_account uuid)
RETURNS TABLE (
  account_id uuid,
  company_id uuid,
  assigned_rep_id uuid,
  score int,
  rag_status text,
  last_visit_date date,
  last_visit_days int,
  open_deals_count int,
  open_deals_value numeric,
  pending_followups int,
  score_breakdown jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_rep uuid;
  v_last_visit date;
  v_visit_days int;
  v_open_count int;
  v_open_value numeric;
  v_pending_quotes int;
  v_stale_deals int;
  v_last_call_days int;
  v_last_email_days int;
  v_score int := 100;
  v_break jsonb := '[]'::jsonb;
  v_ded int;
  v_rag text;
BEGIN
  SELECT a.company_id, COALESCE(a.primary_owner,
    (SELECT l.assigned_to FROM crm_leads l WHERE l.account_id = a.id AND l.assigned_to IS NOT NULL
       ORDER BY l.last_activity_at DESC LIMIT 1))
  INTO v_company, v_rep
  FROM crm_accounts a WHERE a.id = _account;

  IF v_company IS NULL THEN RETURN; END IF;

  -- last visit
  SELECT MAX(vc.checkin_time)::date INTO v_last_visit
  FROM visit_checkins vc
  JOIN crm_leads l ON l.id = vc.lead_id
  WHERE l.account_id = _account;
  IF v_last_visit IS NULL THEN
    SELECT MAX(cv.meeting_at)::date INTO v_last_visit
    FROM customer_visits cv
    JOIN crm_leads l ON l.assigned_to = cv.user_id
    WHERE l.account_id = _account;
  END IF;

  v_visit_days := CASE WHEN v_last_visit IS NULL THEN 9999 ELSE (CURRENT_DATE - v_last_visit) END;

  -- open deals
  SELECT COUNT(*), COALESCE(SUM(expected_value),0)
  INTO v_open_count, v_open_value
  FROM crm_leads
  WHERE account_id = _account AND stage NOT IN ('won','lost');

  -- pending followups: open quotes (draft/sent) created >7d ago
  SELECT COUNT(*) INTO v_pending_quotes
  FROM crm_quotes q
  JOIN crm_leads l ON l.id = q.lead_id
  WHERE l.account_id = _account
    AND q.status IN ('draft','sent')
    AND q.created_at < now() - INTERVAL '7 days';

  -- stale deals: open leads with no activity in 14d
  SELECT COUNT(*) INTO v_stale_deals
  FROM crm_leads
  WHERE account_id = _account
    AND stage NOT IN ('won','lost')
    AND last_activity_at < now() - INTERVAL '14 days';

  -- last call days
  SELECT EXTRACT(DAY FROM (now() - MAX(a.occurred_at)))::int
  INTO v_last_call_days
  FROM crm_lead_activities a
  JOIN crm_leads l ON l.id = a.lead_id
  WHERE l.account_id = _account AND a.activity_type = 'call';
  IF v_last_call_days IS NULL THEN v_last_call_days := 9999; END IF;

  -- last email/WhatsApp days
  SELECT EXTRACT(DAY FROM (now() - MAX(a.occurred_at)))::int
  INTO v_last_email_days
  FROM crm_lead_activities a
  JOIN crm_leads l ON l.id = a.lead_id
  WHERE l.account_id = _account AND a.activity_type IN ('email','note');
  IF v_last_email_days IS NULL THEN v_last_email_days := 9999; END IF;

  -- deductions
  IF v_visit_days > 7 THEN
    v_ded := LEAST(40, (v_visit_days - 7) * 2);
    v_score := v_score - v_ded;
    v_break := v_break || jsonb_build_object('factor','last_visit','label','Days since last visit','value',v_visit_days,'deduction',-v_ded);
  END IF;
  IF v_pending_quotes > 0 THEN
    v_score := v_score - 15;
    v_break := v_break || jsonb_build_object('factor','pending_quotes','label','Open proposals not followed up','value',v_pending_quotes,'deduction',-15);
  END IF;
  IF v_stale_deals > 0 THEN
    v_score := v_score - 10;
    v_break := v_break || jsonb_build_object('factor','stale_deals','label','Deals not updated >14 days','value',v_stale_deals,'deduction',-10);
  END IF;
  IF v_last_call_days > 30 THEN
    v_score := v_score - 10;
    v_break := v_break || jsonb_build_object('factor','no_calls','label','No calls logged in 30 days','value',v_last_call_days,'deduction',-10);
  END IF;
  IF v_last_email_days > 14 THEN
    v_score := v_score - 5;
    v_break := v_break || jsonb_build_object('factor','no_email','label','No email/WhatsApp follow-up','value',v_last_email_days,'deduction',-5);
  END IF;

  v_score := GREATEST(0, v_score);
  v_rag := CASE WHEN v_score >= 70 THEN 'green' WHEN v_score >= 40 THEN 'amber' ELSE 'red' END;

  RETURN QUERY SELECT
    _account, v_company, v_rep, v_score, v_rag,
    v_last_visit, v_visit_days,
    v_open_count, v_open_value,
    (v_pending_quotes + v_stale_deals), v_break;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_client_health(uuid) TO authenticated, service_role;
