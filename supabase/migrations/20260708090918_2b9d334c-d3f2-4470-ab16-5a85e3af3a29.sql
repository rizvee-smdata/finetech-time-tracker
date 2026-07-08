
-- 1) work_categories
CREATE TABLE public.work_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#64748B',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_categories TO authenticated;
GRANT ALL ON public.work_categories TO service_role;
ALTER TABLE public.work_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_categories readable by authenticated"
  ON public.work_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "work_categories admin write"
  ON public.work_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed categories
INSERT INTO public.work_categories (name, color, sort_order) VALUES
  ('Tender / Bid Preparation',              '#2E74B5', 1),
  ('Proposal & BoQ Writing',                '#7C3AED', 2),
  ('Pre-sales / Solution Design',           '#0EA5E9', 3),
  ('Documentation & Reporting',             '#0891B2', 4),
  ('Internal Meeting',                      '#F59E0B', 5),
  ('Customer Call / Follow-up (Remote)',    '#10B981', 6),
  ('OEM Training / Certification',          '#8B5CF6', 7),
  ('Support / Troubleshooting',             '#EF4444', 8),
  ('Demo / POC Preparation',                '#EC4899', 9),
  ('Admin & Operations',                    '#6B7280', 10),
  ('Learning / R&D',                        '#14B8A6', 11),
  ('Other',                                 '#94A3B8', 12);

-- 2) office_work_logs
CREATE TABLE public.office_work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  day_summary text,
  total_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_work_logs TO authenticated;
GRANT ALL ON public.office_work_logs TO service_role;
ALTER TABLE public.office_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_work_logs owner all"
  ON public.office_work_logs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "office_work_logs manager/admin read"
  ON public.office_work_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX office_work_logs_user_date_idx ON public.office_work_logs (user_id, work_date DESC);
CREATE INDEX office_work_logs_company_date_idx ON public.office_work_logs (company_id, work_date DESC);

-- 3) office_work_tasks
CREATE TABLE public.office_work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.office_work_logs(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.work_categories(id),
  project_name text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  description text NOT NULL,
  start_time time,
  end_time time,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','in_progress','blocked')),
  blocker_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_work_tasks TO authenticated;
GRANT ALL ON public.office_work_tasks TO service_role;
ALTER TABLE public.office_work_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_work_tasks owner all"
  ON public.office_work_tasks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.office_work_logs l WHERE l.id = log_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.office_work_logs l WHERE l.id = log_id AND l.user_id = auth.uid()));
CREATE POLICY "office_work_tasks manager/admin read"
  ON public.office_work_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX office_work_tasks_log_idx ON public.office_work_tasks (log_id, sort_order);
CREATE INDEX office_work_tasks_category_idx ON public.office_work_tasks (category_id);

-- 4) updated_at + total_minutes triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER work_categories_upd BEFORE UPDATE ON public.work_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER office_work_logs_upd BEFORE UPDATE ON public.office_work_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER office_work_tasks_upd BEFORE UPDATE ON public.office_work_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.recalc_office_work_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.log_id, OLD.log_id);
  UPDATE public.office_work_logs
     SET total_minutes = COALESCE((SELECT SUM(duration_minutes) FROM public.office_work_tasks WHERE log_id = target), 0),
         updated_at = now()
   WHERE id = target;
  RETURN NULL;
END; $$;

CREATE TRIGGER office_work_tasks_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.office_work_tasks
FOR EACH ROW EXECUTE FUNCTION public.recalc_office_work_total();

-- 5) Migrate legacy office_study rows from customer_visits
DO $$
DECLARE
  v RECORD;
  new_log_id uuid;
  other_id uuid;
  d date;
BEGIN
  SELECT id INTO other_id FROM public.work_categories WHERE name = 'Other';
  FOR v IN
    SELECT id, user_id, company_id, meeting_at, discussion_summary
      FROM public.customer_visits
     WHERE status = 'office_study'
  LOOP
    d := (v.meeting_at AT TIME ZONE 'Asia/Dhaka')::date;
    INSERT INTO public.office_work_logs (user_id, company_id, work_date, day_summary)
      VALUES (v.user_id, v.company_id, d, NULL)
      ON CONFLICT (user_id, work_date) DO UPDATE SET company_id = COALESCE(public.office_work_logs.company_id, EXCLUDED.company_id)
      RETURNING id INTO new_log_id;

    INSERT INTO public.office_work_tasks (log_id, category_id, description, duration_minutes, status, sort_order)
      VALUES (new_log_id, other_id, COALESCE(NULLIF(TRIM(v.discussion_summary), ''), 'Office work'), 480, 'completed', 0);
  END LOOP;
END $$;
