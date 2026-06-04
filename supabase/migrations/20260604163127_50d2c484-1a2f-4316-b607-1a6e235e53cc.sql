
CREATE TABLE public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holiday_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_holidays TO authenticated;
GRANT ALL ON public.company_holidays TO service_role;
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view holidays" ON public.company_holidays
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "staff manage holidays" ON public.company_holidays
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id));

CREATE TABLE public.visit_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  target_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('morning','evening')),
  in_app_sent_at timestamptz,
  email_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_date, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_reminder_log TO authenticated;
GRANT ALL ON public.visit_reminder_log TO service_role;
ALTER TABLE public.visit_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own reminder log" ON public.visit_reminder_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_vrl_user_date ON public.visit_reminder_log(user_id, target_date);

-- Previous working day = most recent date strictly before _from that is not Friday (dow=5)
-- and not in company_holidays for the company.
CREATE OR REPLACE FUNCTION public.previous_working_day(_company uuid, _from date)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := _from - 1;
  i int := 0;
BEGIN
  WHILE i < 14 LOOP
    IF EXTRACT(DOW FROM d)::int <> 5
       AND NOT EXISTS (
         SELECT 1 FROM public.company_holidays
         WHERE company_id = _company AND holiday_date = d
       )
    THEN
      RETURN d;
    END IF;
    d := d - 1;
    i := i + 1;
  END LOOP;
  RETURN _from - 1;
END $$;
