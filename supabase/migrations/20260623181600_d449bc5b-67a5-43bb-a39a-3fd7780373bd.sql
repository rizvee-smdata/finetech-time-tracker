-- Phase 1: Trust & Data Quality

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS is_low_quality boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_reasons jsonb;

ALTER TABLE public.visit_analytics_settings
  ADD COLUMN IF NOT EXISTS low_quality_min_duration_minutes integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS integrity_visible_to_reps boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_visit_insights ADD COLUMN IF NOT EXISTS reasoning jsonb;
ALTER TABLE public.visit_alert_log ADD COLUMN IF NOT EXISTS reasoning jsonb;

CREATE TABLE IF NOT EXISTS public.visit_quality_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  visit_id uuid NOT NULL REFERENCES public.customer_visits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reasons jsonb NOT NULL,
  reasoning_text text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_quality_flags TO authenticated;
GRANT ALL ON public.visit_quality_flags TO service_role;

ALTER TABLE public.visit_quality_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff in company can view quality flags"
  ON public.visit_quality_flags FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Staff in company can insert quality flags"
  ON public.visit_quality_flags FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins can manage quality flags"
  ON public.visit_quality_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_visit_quality_flags_company_user
  ON public.visit_quality_flags(company_id, user_id, detected_at DESC);

CREATE OR REPLACE FUNCTION public.compute_visit_quality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold_min int := 3;
  v_duration_min int;
  v_reasons jsonb := '[]'::jsonb;
  v_low boolean := false;
  v_reason_text text;
BEGIN
  SELECT low_quality_min_duration_minutes INTO v_threshold_min
  FROM public.visit_analytics_settings
  WHERE company_id = NEW.company_id LIMIT 1;
  IF v_threshold_min IS NULL THEN v_threshold_min := 3; END IF;

  -- Look up duration from matching visit_checkins (same user, same day as meeting_at)
  SELECT GREATEST(0, EXTRACT(EPOCH FROM (checkout_time - checkin_time))::int / 60)
  INTO v_duration_min
  FROM public.visit_checkins
  WHERE user_id = NEW.user_id
    AND checkout_time IS NOT NULL
    AND checkin_time::date = NEW.meeting_at::date
  ORDER BY checkin_time DESC
  LIMIT 1;

  IF v_duration_min IS NOT NULL AND v_duration_min < v_threshold_min THEN
    v_reasons := v_reasons || jsonb_build_object('factor','short_duration','threshold_minutes',v_threshold_min,'actual_minutes',v_duration_min);
  END IF;
  IF NEW.next_action IS NULL OR btrim(NEW.next_action) = '' THEN
    v_reasons := v_reasons || jsonb_build_object('factor','no_next_action');
  END IF;
  IF NEW.discussion_summary IS NULL OR btrim(NEW.discussion_summary) = '' THEN
    v_reasons := v_reasons || jsonb_build_object('factor','no_meeting_notes');
  END IF;

  -- Low quality when no notes AND no next action (with or without short duration)
  IF (NEW.next_action IS NULL OR btrim(NEW.next_action)='')
     AND (NEW.discussion_summary IS NULL OR btrim(NEW.discussion_summary)='') THEN
    v_low := true;
  END IF;

  NEW.is_low_quality := v_low;
  NEW.quality_reasons := v_reasons;

  IF v_low THEN
    v_reason_text := 'Low-quality visit: ' ||
      CASE WHEN v_duration_min IS NOT NULL
           THEN 'duration ' || v_duration_min || ' min; '
           ELSE '' END ||
      'no next action recorded; no meeting notes entered.';
    INSERT INTO public.visit_quality_flags (company_id, visit_id, user_id, reasons, reasoning_text)
    VALUES (NEW.company_id, NEW.id, NEW.user_id, v_reasons, v_reason_text)
    ON CONFLICT (visit_id) DO UPDATE
      SET reasons = EXCLUDED.reasons, reasoning_text = EXCLUDED.reasoning_text, detected_at = now();
  ELSE
    DELETE FROM public.visit_quality_flags WHERE visit_id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compute_visit_quality ON public.customer_visits;
CREATE TRIGGER trg_compute_visit_quality
  BEFORE INSERT OR UPDATE ON public.customer_visits
  FOR EACH ROW EXECUTE FUNCTION public.compute_visit_quality();
