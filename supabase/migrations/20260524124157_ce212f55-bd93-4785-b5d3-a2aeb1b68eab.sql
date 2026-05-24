-- Message templates for emails / WhatsApp
CREATE TABLE public.crm_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email', -- email | whatsapp | sms
  subject text,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_msgtpl_select ON public.crm_message_templates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), company_id));

CREATE POLICY crm_msgtpl_manage ON public.crm_message_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE TRIGGER set_updated_at_msgtpl
  BEFORE UPDATE ON public.crm_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sequences (cadence definitions)
CREATE TABLE public.crm_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_seq_select ON public.crm_sequences
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), company_id));

CREATE POLICY crm_seq_manage ON public.crm_sequences
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE TRIGGER set_updated_at_seq
  BEFORE UPDATE ON public.crm_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Steps inside a sequence
CREATE TABLE public.crm_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1,
  day_offset integer NOT NULL DEFAULT 0, -- days after enrollment
  channel text NOT NULL DEFAULT 'email',
  template_id uuid REFERENCES public.crm_message_templates(id) ON DELETE SET NULL,
  subject text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_seqstep_select ON public.crm_sequence_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_sequences s WHERE s.id = sequence_id AND (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), s.company_id))));

CREATE POLICY crm_seqstep_manage ON public.crm_sequence_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_sequences s WHERE s.id = sequence_id AND (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), s.company_id) AND is_staff(auth.uid())))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_sequences s WHERE s.id = sequence_id AND (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), s.company_id) AND is_staff(auth.uid())))));

-- Lead enrollments in a sequence
CREATE TABLE public.crm_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  enrolled_by uuid,
  status text NOT NULL DEFAULT 'active', -- active | paused | completed | cancelled
  current_step integer NOT NULL DEFAULT 0,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (sequence_id, lead_id)
);

ALTER TABLE public.crm_sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_seqenr_select ON public.crm_sequence_enrollments
  FOR SELECT TO authenticated
  USING (crm_can_view_lead(auth.uid(), lead_id));

CREATE POLICY crm_seqenr_manage ON public.crm_sequence_enrollments
  FOR ALL TO authenticated
  USING (crm_can_view_lead(auth.uid(), lead_id))
  WITH CHECK (crm_can_view_lead(auth.uid(), lead_id));

CREATE INDEX idx_seq_enr_lead ON public.crm_sequence_enrollments(lead_id);
CREATE INDEX idx_seq_steps_seq ON public.crm_sequence_steps(sequence_id, step_order);