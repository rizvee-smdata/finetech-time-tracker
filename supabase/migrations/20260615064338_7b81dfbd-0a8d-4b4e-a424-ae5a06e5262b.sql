CREATE OR REPLACE FUNCTION public.auto_close_prior_visit_checkins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.visit_checkins
  SET
    checkout_time = COALESCE(NEW.checkin_time, now()),
    checkout_lat = COALESCE(NEW.checkin_lat, checkout_lat),
    checkout_lng = COALESCE(NEW.checkin_lng, checkout_lng),
    updated_at = now()
  WHERE user_id = NEW.user_id
    AND company_id = NEW.company_id
    AND checkout_time IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close_prior_visit_checkins ON public.visit_checkins;
CREATE TRIGGER trg_auto_close_prior_visit_checkins
  BEFORE INSERT ON public.visit_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_close_prior_visit_checkins();