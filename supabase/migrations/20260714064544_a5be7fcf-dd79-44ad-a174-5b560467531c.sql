
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('lead_created','lead_updated','deal_stage_changed','visit_created','schedule','manual','webhook')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  step_type text NOT NULL CHECK (step_type IN ('condition','delay','assign','update_field','send_email','send_whatsapp','send_sms','create_task','call_webhook','require_approval')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_on_true uuid,
  next_on_false uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','waiting')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_type text,
  entity_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text
);

CREATE TABLE public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','skipped','waiting')),
  result jsonb,
  scheduled_for timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_company ON public.workflows(company_id, is_active);
CREATE INDEX idx_workflow_steps_wf ON public.workflow_steps(workflow_id, sort_order);
CREATE INDEX idx_workflow_runs_wf ON public.workflow_runs(workflow_id, status);
CREATE INDEX idx_workflow_run_steps_pending ON public.workflow_run_steps(status, scheduled_for) WHERE status IN ('pending','waiting');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps   TO authenticated;
GRANT SELECT ON public.workflow_runs      TO authenticated;
GRANT SELECT ON public.workflow_run_steps TO authenticated;
GRANT ALL ON public.workflows        TO service_role;
GRANT ALL ON public.workflow_steps   TO service_role;
GRANT ALL ON public.workflow_runs    TO service_role;
GRANT ALL ON public.workflow_run_steps TO service_role;

ALTER TABLE public.workflows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins/managers manage workflows"
  ON public.workflows FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  );

CREATE POLICY "Manage workflow steps of accessible workflows"
  ON public.workflow_steps FOR ALL TO authenticated
  USING (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  )
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM public.workflows
      WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Read own company workflow runs"
  ON public.workflow_runs FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Read own company workflow run steps"
  ON public.workflow_run_steps FOR SELECT TO authenticated
  USING (
    run_id IN (
      SELECT id FROM public.workflow_runs
      WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.lead_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  strategy text NOT NULL CHECK (strategy IN ('round_robin','load_balanced','territory','first')),
  assignee_pool uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_routing_state (
  rule_id uuid PRIMARY KEY REFERENCES public.lead_routing_rules(id) ON DELETE CASCADE,
  rr_cursor int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_routing_rules_company_active ON public.lead_routing_rules(company_id, is_active, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_routing_rules TO authenticated;
GRANT SELECT ON public.lead_routing_state TO authenticated;
GRANT ALL ON public.lead_routing_rules TO service_role;
GRANT ALL ON public.lead_routing_state TO service_role;

ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_routing_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers manage routing rules"
  ON public.lead_routing_rules FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  );

CREATE POLICY "Read routing state for accessible rules"
  ON public.lead_routing_state FOR SELECT TO authenticated
  USING (
    rule_id IN (
      SELECT id FROM public.lead_routing_rules
      WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

CREATE TRIGGER routing_rules_updated_at
  BEFORE UPDATE ON public.lead_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.evaluate_lead_routing(_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_row public.crm_leads%ROWTYPE;
  rule RECORD;
  cond jsonb;
  matches boolean;
  fval text;
  op text;
  target text;
  pool uuid[];
  chosen uuid;
  idx int;
  cnt int;
  min_load int;
  candidate uuid;
  candidate_load int;
BEGIN
  SELECT * INTO lead_row FROM public.crm_leads WHERE id = _lead_id;
  IF NOT FOUND OR lead_row.assigned_to IS NOT NULL THEN
    RETURN lead_row.assigned_to;
  END IF;

  FOR rule IN
    SELECT * FROM public.lead_routing_rules
    WHERE company_id = lead_row.company_id AND is_active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    matches := true;
    FOR cond IN SELECT * FROM jsonb_array_elements(COALESCE(rule.conditions, '[]'::jsonb))
    LOOP
      op := cond->>'op';
      target := cond->>'value';
      CASE cond->>'field'
        WHEN 'source' THEN fval := lead_row.source;
        WHEN 'industry' THEN fval := lead_row.industry;
        WHEN 'territory_id' THEN fval := lead_row.territory_id::text;
        WHEN 'stage' THEN fval := lead_row.stage;
        WHEN 'country' THEN fval := lead_row.country;
        ELSE fval := NULL;
      END CASE;

      IF op = 'equals' THEN
        IF fval IS DISTINCT FROM target THEN matches := false; EXIT; END IF;
      ELSIF op = 'not_equals' THEN
        IF fval IS NOT DISTINCT FROM target THEN matches := false; EXIT; END IF;
      ELSIF op = 'contains' THEN
        IF fval IS NULL OR position(lower(target) in lower(fval)) = 0 THEN matches := false; EXIT; END IF;
      ELSIF op = 'is_set' THEN
        IF fval IS NULL OR fval = '' THEN matches := false; EXIT; END IF;
      ELSIF op = 'is_empty' THEN
        IF fval IS NOT NULL AND fval <> '' THEN matches := false; EXIT; END IF;
      END IF;
    END LOOP;

    IF NOT matches THEN CONTINUE; END IF;

    pool := rule.assignee_pool;
    IF pool IS NULL OR array_length(pool,1) IS NULL THEN CONTINUE; END IF;

    IF rule.strategy = 'first' THEN
      chosen := pool[1];
    ELSIF rule.strategy = 'round_robin' THEN
      INSERT INTO public.lead_routing_state(rule_id, rr_cursor) VALUES (rule.id, 0)
        ON CONFLICT (rule_id) DO NOTHING;
      SELECT rr_cursor INTO idx FROM public.lead_routing_state WHERE rule_id = rule.id FOR UPDATE;
      cnt := array_length(pool,1);
      chosen := pool[(idx % cnt) + 1];
      UPDATE public.lead_routing_state
        SET rr_cursor = (idx + 1) % cnt, updated_at = now()
        WHERE rule_id = rule.id;
    ELSIF rule.strategy = 'load_balanced' THEN
      min_load := NULL;
      FOR candidate IN SELECT unnest(pool) LOOP
        SELECT count(*) INTO candidate_load FROM public.crm_leads
          WHERE assigned_to = candidate AND stage NOT IN ('won','lost');
        IF min_load IS NULL OR candidate_load < min_load THEN
          min_load := candidate_load;
          chosen := candidate;
        END IF;
      END LOOP;
    ELSIF rule.strategy = 'territory' THEN
      SELECT p INTO chosen FROM unnest(pool) AS p
        WHERE EXISTS (
          SELECT 1 FROM public.crm_territories t
          WHERE t.id = lead_row.territory_id AND t.owner_user_id = p
        ) LIMIT 1;
      IF chosen IS NULL THEN chosen := pool[1]; END IF;
    END IF;

    IF chosen IS NOT NULL THEN
      UPDATE public.crm_leads SET assigned_to = chosen WHERE id = _lead_id;
      RETURN chosen;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_auto_route_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    PERFORM public.evaluate_lead_routing(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_route_lead ON public.crm_leads;
CREATE TRIGGER auto_route_lead
  AFTER INSERT ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_auto_route_lead();
