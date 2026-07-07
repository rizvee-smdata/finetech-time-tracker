
-- 1. Per-company tier visit-frequency rules
CREATE TABLE IF NOT EXISTS public.visit_frequency_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tier customer_tier NOT NULL,
  interval_days int NOT NULL CHECK (interval_days > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_frequency_rules TO authenticated;
GRANT ALL ON public.visit_frequency_rules TO service_role;
ALTER TABLE public.visit_frequency_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read rules"
  ON public.visit_frequency_rules FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Staff manage rules"
  ON public.visit_frequency_rules FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

-- Per-account override + snooze on customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS expected_visit_interval_days int NULL;

-- 2. Snoozes
CREATE TABLE IF NOT EXISTS public.visit_snoozes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snoozed_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_snoozes_customer_idx ON public.visit_snoozes(customer_id, snoozed_until);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_snoozes TO authenticated;
GRANT ALL ON public.visit_snoozes TO service_role;
ALTER TABLE public.visit_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read snoozes"
  ON public.visit_snoozes FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Users create own snoozes"
  ON public.visit_snoozes FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND user_id = auth.uid());
CREATE POLICY "Users delete own snoozes"
  ON public.visit_snoozes FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- 3. Gap scores
CREATE TABLE IF NOT EXISTS public.visit_gap_scores (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_rep_id uuid NULL,
  tier customer_tier NULL,
  last_visit_date timestamptz NULL,
  days_since_last_visit int NULL,
  expected_interval_days int NOT NULL,
  gap_score numeric NOT NULL DEFAULT 0,
  priority text NOT NULL CHECK (priority IN ('critical','high','due_soon','healthy')),
  open_pipeline_value numeric NOT NULL DEFAULT 0,
  has_near_close boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vgs_rep_priority_idx ON public.visit_gap_scores(assigned_rep_id, priority);
CREATE INDEX IF NOT EXISTS vgs_company_priority_idx ON public.visit_gap_scores(company_id, priority);
GRANT SELECT ON public.visit_gap_scores TO authenticated;
GRANT ALL ON public.visit_gap_scores TO service_role;
ALTER TABLE public.visit_gap_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own gaps"
  ON public.visit_gap_scores FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id)
    AND (public.is_staff(auth.uid()) OR assigned_rep_id = auth.uid())
  );

-- 4. RPC: compute gaps for a company (or all if _company IS NULL)
CREATE OR REPLACE FUNCTION public.compute_visit_gaps(_company uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_last timestamptz;
  v_days int;
  v_interval int;
  v_default_interval int;
  v_pipe numeric;
  v_near boolean;
  v_base numeric;
  v_score numeric;
  v_priority text;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT c.id, c.company_id, c.assigned_rep_id, c.tier, c.expected_visit_interval_days, c.created_at
    FROM public.customers c
    WHERE c.deleted_at IS NULL
      AND (_company IS NULL OR c.company_id = _company)
  LOOP
    -- last visit (checkins or visit_reports)
    SELECT MAX(x) INTO v_last FROM (
      SELECT MAX(checkin_time) AS x FROM public.visit_checkins WHERE customer_id = r.id
      UNION ALL
      SELECT MAX(meeting_at) FROM public.customer_visits WHERE user_id = r.assigned_rep_id
        AND lower(company) = lower((SELECT customer_name FROM public.customers WHERE id = r.id))
    ) s;

    -- Resolve expected interval: per-account override → tier rule → fallback (strategic 14, standard 30, low_priority 60)
    v_default_interval := CASE r.tier
      WHEN 'strategic' THEN 14
      WHEN 'standard' THEN 30
      WHEN 'low_priority' THEN 60
      ELSE 30
    END;
    v_interval := COALESCE(
      r.expected_visit_interval_days,
      (SELECT interval_days FROM public.visit_frequency_rules
        WHERE company_id = r.company_id AND tier = r.tier),
      v_default_interval
    );

    -- Days since last visit; if never visited use age of account (min forced to critical)
    IF v_last IS NULL THEN
      v_days := GREATEST(1, EXTRACT(DAY FROM (now() - r.created_at))::int);
    ELSE
      v_days := GREATEST(0, EXTRACT(DAY FROM (now() - v_last))::int);
    END IF;

    -- Open pipeline for this customer's account (via crm_leads on same customer_name+company)
    SELECT COALESCE(SUM(expected_value), 0),
           BOOL_OR(expected_close_date IS NOT NULL
                   AND expected_close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
      INTO v_pipe, v_near
    FROM public.crm_leads l
    WHERE l.company_id = r.company_id
      AND l.stage IN ('initial_contact','pricing','negotiation','closure')
      AND l.customer_id = r.id;

    v_pipe := COALESCE(v_pipe, 0);
    v_near := COALESCE(v_near, false);

    IF v_last IS NULL THEN
      v_score := 5;
    ELSE
      v_base := (v_days::numeric - v_interval) / GREATEST(v_interval, 1);
      v_base := GREATEST(v_base, 0);
      IF v_pipe > 0 THEN v_base := v_base * 1.5; END IF;
      IF v_near THEN v_base := v_base * 2; END IF;
      v_score := v_base;
    END IF;

    v_priority := CASE
      WHEN v_score > 1 THEN 'critical'
      WHEN v_score >= 0.5 THEN 'high'
      WHEN v_score >= 0.01 THEN 'due_soon'
      ELSE 'healthy'
    END;

    INSERT INTO public.visit_gap_scores (
      customer_id, company_id, assigned_rep_id, tier,
      last_visit_date, days_since_last_visit, expected_interval_days,
      gap_score, priority, open_pipeline_value, has_near_close, computed_at
    ) VALUES (
      r.id, r.company_id, r.assigned_rep_id, r.tier,
      v_last, v_days, v_interval,
      round(v_score::numeric, 3), v_priority, v_pipe, v_near, now()
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      company_id = EXCLUDED.company_id,
      assigned_rep_id = EXCLUDED.assigned_rep_id,
      tier = EXCLUDED.tier,
      last_visit_date = EXCLUDED.last_visit_date,
      days_since_last_visit = EXCLUDED.days_since_last_visit,
      expected_interval_days = EXCLUDED.expected_interval_days,
      gap_score = EXCLUDED.gap_score,
      priority = EXCLUDED.priority,
      open_pipeline_value = EXCLUDED.open_pipeline_value,
      has_near_close = EXCLUDED.has_near_close,
      computed_at = EXCLUDED.computed_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_visit_gaps(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_visit_gaps(uuid) TO service_role;
