
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
    SELECT c.id, c.company_id, c.assigned_rep_id, c.tier, c.expected_visit_interval_days, c.created_at, c.customer_name
    FROM public.customers c
    WHERE c.deleted_at IS NULL
      AND (_company IS NULL OR c.company_id = _company)
  LOOP
    -- last visit: checkins on leads for this customer, OR customer_visits by name match
    SELECT MAX(x) INTO v_last FROM (
      SELECT MAX(vc.checkin_time) AS x
        FROM public.visit_checkins vc
        JOIN public.crm_leads l ON l.id = vc.lead_id
       WHERE l.customer_id = r.id
      UNION ALL
      SELECT MAX(meeting_at)
        FROM public.customer_visits cv
       WHERE cv.company_id = r.company_id
         AND lower(cv.company) = lower(r.customer_name)
    ) s;

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

    IF v_last IS NULL THEN
      v_days := GREATEST(1, EXTRACT(DAY FROM (now() - r.created_at))::int);
    ELSE
      v_days := GREATEST(0, EXTRACT(DAY FROM (now() - v_last))::int);
    END IF;

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
