
-- 1) Extend tms_tasks for daily planner
ALTER TABLE public.tms_tasks
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_tms_tasks_scheduled_date
  ON public.tms_tasks(company_id, scheduled_date)
  WHERE deleted_at IS NULL;

-- 2) EOD summaries
CREATE TABLE IF NOT EXISTS public.eod_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  summary_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date),
  summary_text text,
  rep_notes text,
  tasks_completed int NOT NULL DEFAULT 0,
  tasks_deferred int NOT NULL DEFAULT 0,
  visits_done int NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, summary_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eod_summaries TO authenticated;
GRANT ALL ON public.eod_summaries TO service_role;

ALTER TABLE public.eod_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eod_own_select" ON public.eod_summaries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "eod_own_insert" ON public.eod_summaries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));

CREATE POLICY "eod_own_update" ON public.eod_summaries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "eod_own_delete" ON public.eod_summaries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_eod_updated_at BEFORE UPDATE ON public.eod_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Trigger: flag completed task with linked lead but no activity today
CREATE OR REPLACE FUNCTION public.tms_check_completion_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_terminal boolean;
  _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  _has_activity boolean;
BEGIN
  IF NEW.status_id IS NULL OR NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN
    RETURN NEW;
  END IF;
  SELECT is_terminal INTO _is_terminal FROM public.tms_task_statuses WHERE id = NEW.status_id;
  IF NOT COALESCE(_is_terminal, false) THEN
    RETURN NEW;
  END IF;
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.crm_lead_activities
    WHERE lead_id = NEW.lead_id
      AND occurred_at::date = _today
  ) INTO _has_activity;

  IF NOT _has_activity AND NEW.created_by IS NOT NULL THEN
    INSERT INTO public.reminders (user_id, company_id, title, body, remind_at)
    VALUES (
      NEW.created_by, NEW.company_id,
      'Log follow-up: ' || NEW.title,
      'Task completed but no CRM activity or visit logged today for the linked lead.',
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tms_completion_followup ON public.tms_tasks;
CREATE TRIGGER trg_tms_completion_followup
  AFTER UPDATE OF status_id ON public.tms_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tms_check_completion_followup();
