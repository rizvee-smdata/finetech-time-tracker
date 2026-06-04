
CREATE TABLE public.coaching_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  strength text,
  focus_area text,
  win_pattern text,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  engagement_score integer CHECK (engagement_score BETWEEN 1 AND 10),
  motivational_message text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX coaching_insights_company_idx ON public.coaching_insights (company_id, week_start DESC);
CREATE INDEX coaching_insights_user_idx ON public.coaching_insights (user_id, week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_insights TO authenticated;
GRANT ALL ON public.coaching_insights TO service_role;

ALTER TABLE public.coaching_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_insights_select" ON public.coaching_insights
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "coaching_insights_insert_self" ON public.coaching_insights
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));

CREATE POLICY "coaching_insights_insert_staff" ON public.coaching_insights
  FOR INSERT TO authenticated
  WITH CHECK (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()));

CREATE POLICY "coaching_insights_update" ON public.coaching_insights
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE POLICY "coaching_insights_delete" ON public.coaching_insights
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());

CREATE TRIGGER coaching_insights_touch
  BEFORE UPDATE ON public.coaching_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.coaching_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL,
  flagged_by uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','scheduled','done','dismissed')),
  scheduled_at timestamptz,
  insight_id uuid REFERENCES public.coaching_insights(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tms_tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coaching_flags_company_idx ON public.coaching_flags (company_id, created_at DESC);
CREATE INDEX coaching_flags_rep_idx ON public.coaching_flags (rep_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_flags TO authenticated;
GRANT ALL ON public.coaching_flags TO service_role;

ALTER TABLE public.coaching_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_flags_select" ON public.coaching_flags
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR rep_id = auth.uid()
    OR flagged_by = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "coaching_flags_insert" ON public.coaching_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    flagged_by = auth.uid()
    AND is_company_member(auth.uid(), company_id)
    AND is_staff(auth.uid())
  );

CREATE POLICY "coaching_flags_update" ON public.coaching_flags
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR flagged_by = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY "coaching_flags_delete" ON public.coaching_flags
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR flagged_by = auth.uid());

CREATE TRIGGER coaching_flags_touch
  BEFORE UPDATE ON public.coaching_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
