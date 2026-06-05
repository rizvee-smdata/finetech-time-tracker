CREATE TABLE public.prediction_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  run_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_revenue NUMERIC NOT NULL DEFAULT 0,
  best_case NUMERIC NOT NULL DEFAULT 0,
  worst_case NUMERIC NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0,
  gap_to_target NUMERIC NOT NULL DEFAULT 0,
  required_additional_visits INTEGER NOT NULL DEFAULT 0,
  required_additional_proposals INTEGER NOT NULL DEFAULT 0,
  key_driver TEXT,
  risk_factor TEXT,
  recommendation TEXT,
  target_value NUMERIC NOT NULL DEFAULT 0,
  achieved_value NUMERIC NOT NULL DEFAULT 0,
  achievement_pct NUMERIC NOT NULL DEFAULT 0,
  model TEXT,
  alerted_rep_at TIMESTAMPTZ,
  alerted_manager_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, run_date)
);

CREATE INDEX prediction_runs_company_period_idx ON public.prediction_runs (company_id, period_start);
CREATE INDEX prediction_runs_user_period_idx ON public.prediction_runs (user_id, period_start DESC);
CREATE INDEX prediction_runs_run_date_idx ON public.prediction_runs (run_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prediction_runs TO authenticated;
GRANT ALL ON public.prediction_runs TO service_role;

ALTER TABLE public.prediction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps view own predictions"
  ON public.prediction_runs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Staff view company predictions"
  ON public.prediction_runs FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Insert own or staff predictions"
  ON public.prediction_runs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "Update own or staff predictions"
  ON public.prediction_runs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.prediction_runs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER prediction_runs_updated_at
  BEFORE UPDATE ON public.prediction_runs
  FOR EACH ROW EXECUTE FUNCTION public.prediction_runs_set_updated_at();