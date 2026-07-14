
CREATE TABLE public.attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  source text NOT NULL,
  channel text,
  campaign text,
  touch_kind text NOT NULL DEFAULT 'mid' CHECK (touch_kind IN ('first','mid','conversion')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  revenue_value numeric,
  currency text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attr_touch_company ON public.attribution_touchpoints(company_id);
CREATE INDEX idx_attr_touch_lead ON public.attribution_touchpoints(lead_id);
CREATE INDEX idx_attr_touch_occurred ON public.attribution_touchpoints(occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attribution_touchpoints TO authenticated;
GRANT ALL ON public.attribution_touchpoints TO service_role;
ALTER TABLE public.attribution_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attr_touch_select_staff" ON public.attribution_touchpoints FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = attribution_touchpoints.lead_id
      AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
  )
);

CREATE POLICY "attr_touch_insert_staff" ON public.attribution_touchpoints FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger: first-touch on lead insert
CREATE OR REPLACE FUNCTION public.attr_capture_lead_first_touch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.attribution_touchpoints (
    company_id, lead_id, source, channel, touch_kind, occurred_at, metadata
  ) VALUES (
    NEW.company_id, NEW.id,
    COALESCE(NEW.lead_source::text, NEW.source::text, 'unknown'),
    NEW.source::text,
    'first',
    COALESCE(NEW.created_at, now()),
    jsonb_build_object('lead_source', NEW.lead_source, 'source', NEW.source)
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_attr_lead_first_touch
AFTER INSERT ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.attr_capture_lead_first_touch();

-- Trigger: conversion touch when lead becomes Won
CREATE OR REPLACE FUNCTION public.attr_capture_lead_conversion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage::text = 'won' AND (OLD.stage IS NULL OR OLD.stage::text <> 'won') THEN
    INSERT INTO public.attribution_touchpoints (
      company_id, lead_id, source, channel, touch_kind,
      occurred_at, revenue_value, currency, metadata
    ) VALUES (
      NEW.company_id, NEW.id,
      COALESCE(NEW.lead_source::text, NEW.source::text, 'unknown'),
      NEW.source::text,
      'conversion',
      COALESCE(NEW.won_at, now()),
      NEW.expected_value, NEW.currency,
      jsonb_build_object('stage','won')
    );
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_attr_lead_conversion
AFTER UPDATE OF stage ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.attr_capture_lead_conversion();

-- Trigger: mid-funnel touches on lead activities
CREATE OR REPLACE FUNCTION public.attr_capture_activity_touch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.crm_leads WHERE id = NEW.lead_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.attribution_touchpoints (
    company_id, lead_id, source, channel, touch_kind, occurred_at, metadata
  ) VALUES (
    v_company, NEW.lead_id,
    NEW.activity_type::text,
    NEW.activity_type::text,
    'mid',
    COALESCE(NEW.occurred_at, now()),
    COALESCE(NEW.metadata, '{}'::jsonb)
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_attr_activity_touch
AFTER INSERT ON public.crm_lead_activities
FOR EACH ROW EXECUTE FUNCTION public.attr_capture_activity_touch();
