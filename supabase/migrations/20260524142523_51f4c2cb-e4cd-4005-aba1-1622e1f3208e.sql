
-- Survey templates
CREATE TABLE public.survey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view templates"
  ON public.survey_templates FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Staff can manage templates"
  ON public.survey_templates FOR ALL
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER trg_survey_templates_updated
  BEFORE UPDATE ON public.survey_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Survey sentiment enum
CREATE TYPE public.survey_sentiment AS ENUM ('positive', 'neutral', 'negative');

-- Survey responses
CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  template_id uuid REFERENCES public.survey_templates(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.customer_visits(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  submitted_by uuid NOT NULL,
  customer_name text,
  rating int CHECK (rating BETWEEN 1 AND 5),
  sentiment public.survey_sentiment,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view responses"
  ON public.survey_responses FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Reps can submit own responses"
  ON public.survey_responses FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND submitted_by = auth.uid());

CREATE POLICY "Submitter or staff can update"
  ON public.survey_responses FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id) AND (submitted_by = auth.uid() OR public.is_staff(auth.uid())));

CREATE POLICY "Staff can delete responses"
  ON public.survey_responses FOR DELETE
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER trg_survey_responses_updated
  BEFORE UPDATE ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_survey_responses_company ON public.survey_responses(company_id, created_at DESC);
CREATE INDEX idx_survey_responses_visit ON public.survey_responses(visit_id);
CREATE INDEX idx_survey_responses_lead ON public.survey_responses(lead_id);
