
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS weekend_days int[] NOT NULL DEFAULT ARRAY[5]::int[];

-- Update previous_working_day to use company weekend_days
CREATE OR REPLACE FUNCTION public.previous_working_day(_company uuid, _from date)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d date := _from - 1;
  i int := 0;
  _weekend int[];
BEGIN
  SELECT weekend_days INTO _weekend FROM public.companies WHERE id = _company;
  IF _weekend IS NULL THEN _weekend := ARRAY[5]; END IF;

  WHILE i < 21 LOOP
    IF NOT (EXTRACT(DOW FROM d)::int = ANY(_weekend))
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
END $function$;

-- Update enforce_visit_backdate_window to use company weekend_days
CREATE OR REPLACE FUNCTION public.enforce_visit_backdate_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_meeting_date date;
  v_cursor date;
  v_counted int := 0;
  v_earliest date;
  v_weekend int[];
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT weekend_days INTO v_weekend FROM public.companies WHERE id = NEW.company_id;
  IF v_weekend IS NULL THEN v_weekend := ARRAY[5]; END IF;

  v_today := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  v_meeting_date := (NEW.meeting_at AT TIME ZONE 'Asia/Dhaka')::date;

  IF v_meeting_date > v_today THEN
    RAISE EXCEPTION 'Meeting date cannot be in the future' USING ERRCODE = 'check_violation';
  END IF;

  v_cursor := v_today;
  WHILE v_counted < 2 LOOP
    v_cursor := v_cursor - INTERVAL '1 day';
    IF NOT (EXTRACT(DOW FROM v_cursor)::int = ANY(v_weekend))
       AND NOT EXISTS (
         SELECT 1 FROM public.company_holidays h
         WHERE h.company_id = NEW.company_id AND h.holiday_date = v_cursor
       )
    THEN
      v_counted := v_counted + 1;
    END IF;
  END LOOP;
  v_earliest := v_cursor;

  IF v_meeting_date < v_earliest THEN
    RAISE EXCEPTION 'Visits can only be backdated up to 2 working days (weekends & company holidays excluded). Earliest allowed: %', v_earliest
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXTRACT(DOW FROM v_meeting_date)::int = ANY(v_weekend)
     OR EXISTS (
       SELECT 1 FROM public.company_holidays h
       WHERE h.company_id = NEW.company_id AND h.holiday_date = v_meeting_date
     )
  THEN
    RAISE EXCEPTION 'Meeting date falls on a weekend or company holiday' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
