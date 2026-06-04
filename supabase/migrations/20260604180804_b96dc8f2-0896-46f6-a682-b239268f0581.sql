
CREATE OR REPLACE FUNCTION public.enforce_visit_backdate_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_meeting_date date;
  v_cursor date;
  v_counted int := 0;
  v_earliest date;
BEGIN
  -- Admins bypass
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  v_meeting_date := (NEW.meeting_at AT TIME ZONE 'Asia/Dhaka')::date;

  IF v_meeting_date > v_today THEN
    RAISE EXCEPTION 'Meeting date cannot be in the future' USING ERRCODE = 'check_violation';
  END IF;

  -- Walk back day-by-day, skipping Fridays (dow=5) and company holidays, until 2 working days counted
  v_cursor := v_today;
  WHILE v_counted < 2 LOOP
    v_cursor := v_cursor - INTERVAL '1 day';
    IF EXTRACT(DOW FROM v_cursor) <> 5
       AND NOT EXISTS (
         SELECT 1 FROM public.company_holidays h
         WHERE h.company_id = NEW.company_id
           AND h.holiday_date = v_cursor
       )
    THEN
      v_counted := v_counted + 1;
    END IF;
  END LOOP;
  v_earliest := v_cursor;

  IF v_meeting_date < v_earliest THEN
    RAISE EXCEPTION 'Visits can only be backdated up to 2 working days (Fridays & company holidays excluded). Earliest allowed: %', v_earliest
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXTRACT(DOW FROM v_meeting_date) = 5
     OR EXISTS (
       SELECT 1 FROM public.company_holidays h
       WHERE h.company_id = NEW.company_id
         AND h.holiday_date = v_meeting_date
     )
  THEN
    RAISE EXCEPTION 'Meeting date falls on a Friday or company holiday' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_visit_backdate_window ON public.customer_visits;
CREATE TRIGGER trg_enforce_visit_backdate_window
BEFORE INSERT OR UPDATE OF meeting_at ON public.customer_visits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_visit_backdate_window();
