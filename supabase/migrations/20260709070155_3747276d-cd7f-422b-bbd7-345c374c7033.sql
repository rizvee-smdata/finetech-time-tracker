CREATE OR REPLACE FUNCTION public.guard_maintenance_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _mm boolean; _cid uuid;
BEGIN
  _cid := COALESCE(NEW.company_id, OLD.company_id);
  IF _cid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT maintenance_mode INTO _mm FROM public.companies WHERE id = _cid;
  IF COALESCE(_mm,false) AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'System is in maintenance mode. Only admins and managers can make changes.' USING ERRCODE='check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;