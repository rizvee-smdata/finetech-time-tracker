
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  summary TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_company_created ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all logs in their company"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND (company_id IS NULL OR public.is_company_member(auth.uid(), company_id))
);

CREATE POLICY "Users view their own audit entries"
ON public.audit_logs FOR SELECT TO authenticated
USING (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_action TEXT;
  v_entity_id UUID;
  v_company_id UUID;
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create'; v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_entity_id := NEW.id;
  ELSE
    v_action := 'delete'; v_entity_id := OLD.id;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN v_company_id := OLD.company_id;
    ELSE v_company_id := NEW.company_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN v_company_id := NULL;
  END;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, summary, metadata)
  VALUES (v_company_id, v_actor, v_action, v_entity_type, v_entity_id,
          v_entity_type || ' ' || v_action, jsonb_build_object('op', TG_OP));

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_visits AFTER INSERT OR UPDATE OR DELETE ON public.customer_visits
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('visit');
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('lead');
CREATE TRIGGER audit_contracts AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('contract');
CREATE TRIGGER audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('expense');
CREATE TRIGGER audit_quotes AFTER INSERT OR UPDATE OR DELETE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('quote');
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tms_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('task');
CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('company');
CREATE TRIGGER audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('user_role');
