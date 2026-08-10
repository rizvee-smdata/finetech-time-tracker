
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX api_keys_hash_idx ON public.api_keys(key_hash);
CREATE INDEX api_keys_company_idx ON public.api_keys(company_id);

CREATE TABLE public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_request_logs_company_idx ON public.api_request_logs(company_id, created_at DESC);

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active boolean NOT NULL DEFAULT true,
  description text,
  failure_count integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_company_idx ON public.webhook_endpoints(company_id);

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  response_code integer,
  response_body text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_pending_idx ON public.webhook_deliveries(status, next_attempt_at);
CREATE INDEX webhook_deliveries_company_idx ON public.webhook_deliveries(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_admin_manage" ON public.api_keys FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "api_request_logs_admin_read" ON public.api_request_logs FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "webhook_endpoints_admin_manage" ON public.webhook_endpoints FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "webhook_deliveries_admin_read" ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE TRIGGER api_keys_touch BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER webhook_endpoints_touch BEFORE UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(_company uuid, _event text, _payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0;
BEGIN
  INSERT INTO public.webhook_deliveries (endpoint_id, company_id, event, payload)
  SELECT e.id, _company, _event, _payload
  FROM public.webhook_endpoints e
  WHERE e.company_id = _company AND e.is_active AND (_event = ANY(e.events) OR '*' = ANY(e.events));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_webhook_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ev text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := 'lead.created';
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    ev := 'lead.stage_changed';
  ELSE
    ev := 'lead.updated';
  END IF;
  PERFORM public.enqueue_webhook_event(
    NEW.company_id,
    ev,
    jsonb_build_object(
      'id', NEW.id,
      'customer_name', NEW.customer_name,
      'company_name', NEW.company_name,
      'stage', NEW.stage,
      'expected_value', NEW.expected_value,
      'assigned_to', NEW.assigned_to,
      'updated_at', NEW.updated_at
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_leads_webhook_events
AFTER INSERT OR UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.trg_webhook_lead_event();
