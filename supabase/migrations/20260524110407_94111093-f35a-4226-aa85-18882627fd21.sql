
-- =========================================================
-- CRM MODULE
-- =========================================================

-- Stage enum
CREATE TYPE public.crm_lead_stage AS ENUM (
  'new', 'initial_contact', 'pricing', 'negotiation', 'closure', 'won', 'lost'
);

CREATE TYPE public.crm_lead_source AS ENUM ('visit', 'manual');

CREATE TYPE public.crm_activity_type AS ENUM (
  'note', 'call', 'email', 'meeting', 'visit', 'stage_change',
  'task', 'quote', 'attachment', 'created'
);

CREATE TYPE public.crm_quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');

-- =========================================================
-- crm_leads
-- =========================================================
CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  source crm_lead_source NOT NULL DEFAULT 'manual',
  source_visit_id uuid,
  customer_id uuid,
  customer_name text NOT NULL,
  company_name text,
  contact_person text,
  designation text,
  phone text,
  email text,
  location text,
  stage crm_lead_stage NOT NULL DEFAULT 'new',
  assigned_to uuid,
  created_by uuid NOT NULL,
  expected_value numeric(14,2),
  currency text NOT NULL DEFAULT 'INR',
  probability int NOT NULL DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date,
  lost_reason text,
  notes text,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  won_at timestamptz,
  lost_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_leads_company ON public.crm_leads(company_id);
CREATE INDEX idx_crm_leads_stage ON public.crm_leads(company_id, stage);
CREATE INDEX idx_crm_leads_assigned ON public.crm_leads(assigned_to);
CREATE INDEX idx_crm_leads_visit ON public.crm_leads(source_visit_id);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_leads_select" ON public.crm_leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_company_member(auth.uid(), company_id)
      AND (
        is_staff(auth.uid())
        OR assigned_to = auth.uid()
        OR created_by = auth.uid()
      )
    )
  );

CREATE POLICY "crm_leads_insert" ON public.crm_leads
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (has_role(auth.uid(), 'admin'::app_role) OR is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "crm_leads_update" ON public.crm_leads
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_company_member(auth.uid(), company_id)
      AND (is_staff(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
    )
  );

CREATE POLICY "crm_leads_delete" ON public.crm_leads
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Visibility helper for child tables
-- =========================================================
CREATE OR REPLACE FUNCTION public.crm_can_view_lead(_user uuid, _lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = _lead
      AND (
        has_role(_user, 'admin'::app_role)
        OR (
          is_company_member(_user, l.company_id)
          AND (is_staff(_user) OR l.assigned_to = _user OR l.created_by = _user)
        )
      )
  );
$$;

-- =========================================================
-- crm_lead_stage_history
-- =========================================================
CREATE TABLE public.crm_lead_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  from_stage crm_lead_stage,
  to_stage crm_lead_stage NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds bigint
);
CREATE INDEX idx_crm_stage_hist_lead ON public.crm_lead_stage_history(lead_id);

ALTER TABLE public.crm_lead_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stage_hist_select" ON public.crm_lead_stage_history
  FOR SELECT TO authenticated USING (crm_can_view_lead(auth.uid(), lead_id));

-- =========================================================
-- crm_lead_activities
-- =========================================================
CREATE TABLE public.crm_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  user_id uuid,
  activity_type crm_activity_type NOT NULL,
  title text,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_act_lead ON public.crm_lead_activities(lead_id, occurred_at DESC);

ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_act_select" ON public.crm_lead_activities
  FOR SELECT TO authenticated USING (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_act_insert" ON public.crm_lead_activities
  FOR INSERT TO authenticated
  WITH CHECK (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_act_update" ON public.crm_lead_activities
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "crm_act_delete" ON public.crm_lead_activities
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- crm_lead_attachments
-- =========================================================
CREATE TABLE public.crm_lead_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  content_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_att_lead ON public.crm_lead_attachments(lead_id);

ALTER TABLE public.crm_lead_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_att_select" ON public.crm_lead_attachments
  FOR SELECT TO authenticated USING (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_att_insert" ON public.crm_lead_attachments
  FOR INSERT TO authenticated WITH CHECK (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_att_delete" ON public.crm_lead_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = lead_id AND is_company_member(auth.uid(), l.company_id) AND is_staff(auth.uid())))
  );

-- =========================================================
-- crm_quotes
-- =========================================================
CREATE TABLE public.crm_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  version int NOT NULL DEFAULT 1,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status crm_quote_status NOT NULL DEFAULT 'draft',
  valid_until date,
  sent_at timestamptz,
  decided_at timestamptz,
  notes text,
  file_path text,
  file_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_quotes_lead ON public.crm_quotes(lead_id);

ALTER TABLE public.crm_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_quotes_select" ON public.crm_quotes
  FOR SELECT TO authenticated USING (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_quotes_insert" ON public.crm_quotes
  FOR INSERT TO authenticated
  WITH CHECK (crm_can_view_lead(auth.uid(), lead_id) AND created_by = auth.uid());

CREATE POLICY "crm_quotes_update" ON public.crm_quotes
  FOR UPDATE TO authenticated USING (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY "crm_quotes_delete" ON public.crm_quotes
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = lead_id AND is_company_member(auth.uid(), l.company_id) AND is_staff(auth.uid())))
  );

CREATE TRIGGER crm_quotes_updated_at
  BEFORE UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Link tms_tasks to leads
-- =========================================================
ALTER TABLE public.tms_tasks ADD COLUMN lead_id uuid;
CREATE INDEX idx_tms_tasks_lead ON public.tms_tasks(lead_id);

-- =========================================================
-- Stage change trigger: history + activity + timestamps
-- =========================================================
CREATE OR REPLACE FUNCTION public.crm_handle_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _duration bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_changed_at := COALESCE(NEW.stage_changed_at, now());
    IF NEW.stage = 'won' THEN NEW.won_at := COALESCE(NEW.won_at, now()); END IF;
    IF NEW.stage = 'lost' THEN NEW.lost_at := COALESCE(NEW.lost_at, now()); END IF;
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    _duration := EXTRACT(EPOCH FROM (now() - OLD.stage_changed_at))::bigint;
    NEW.stage_changed_at := now();
    NEW.last_activity_at := now();

    IF NEW.stage = 'won' THEN
      NEW.won_at := COALESCE(NEW.won_at, now());
      NEW.probability := 100;
    ELSIF NEW.stage = 'lost' THEN
      NEW.lost_at := COALESCE(NEW.lost_at, now());
      NEW.probability := 0;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_leads_before_change
  BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_lead_change();

CREATE OR REPLACE FUNCTION public.crm_log_lead_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _duration bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_lead_stage_history(lead_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.stage, NEW.created_by);
    INSERT INTO public.crm_lead_activities(lead_id, user_id, activity_type, title, metadata)
    VALUES (NEW.id, NEW.created_by, 'created', 'Lead created',
            jsonb_build_object('source', NEW.source, 'visit_id', NEW.source_visit_id));
    RETURN NEW;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    _duration := EXTRACT(EPOCH FROM (NEW.stage_changed_at - OLD.stage_changed_at))::bigint;
    INSERT INTO public.crm_lead_stage_history(lead_id, from_stage, to_stage, changed_by, duration_seconds)
    VALUES (NEW.id, OLD.stage, NEW.stage, auth.uid(), _duration);
    INSERT INTO public.crm_lead_activities(lead_id, user_id, activity_type, title, metadata)
    VALUES (NEW.id, auth.uid(), 'stage_change',
            'Stage: ' || OLD.stage || ' → ' || NEW.stage,
            jsonb_build_object('from', OLD.stage, 'to', NEW.stage, 'duration_seconds', _duration));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_leads_after_change
  AFTER INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_lead_change();

-- Auto-log quote sent → moves lead to negotiation
CREATE OR REPLACE FUNCTION public.crm_handle_quote_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' AND OLD.status = 'draft' THEN
      NEW.sent_at := COALESCE(NEW.sent_at, now());
      UPDATE public.crm_leads SET stage = 'negotiation', last_activity_at = now()
        WHERE id = NEW.lead_id AND stage IN ('new','initial_contact','pricing');
    END IF;
    IF NEW.status IN ('accepted','rejected') THEN
      NEW.decided_at := COALESCE(NEW.decided_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_quotes_before_change
  BEFORE UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_quote_change();

CREATE OR REPLACE FUNCTION public.crm_log_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_lead_activities(lead_id, user_id, activity_type, title, metadata)
    VALUES (NEW.lead_id, NEW.created_by, 'quote',
            'Quote v' || NEW.version || ' created: ' || NEW.title,
            jsonb_build_object('quote_id', NEW.id, 'amount', NEW.amount, 'status', NEW.status));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_lead_activities(lead_id, user_id, activity_type, title, metadata)
    VALUES (NEW.lead_id, auth.uid(), 'quote',
            'Quote v' || NEW.version || ' ' || NEW.status,
            jsonb_build_object('quote_id', NEW.id, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_quotes_after_change
  AFTER INSERT OR UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_quote();

-- Touch last_activity_at when activity inserted
CREATE OR REPLACE FUNCTION public.crm_touch_lead_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.crm_leads SET last_activity_at = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_act_touch
  AFTER INSERT ON public.crm_lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_lead_activity();

-- =========================================================
-- Storage bucket for CRM attachments
-- =========================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('crm-attachments', 'crm-attachments', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "crm_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crm-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "crm_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "crm_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'crm-attachments' AND auth.uid() IS NOT NULL);
