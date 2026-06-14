CREATE OR REPLACE FUNCTION public.normalize_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
    IF NEW.email = '' THEN NEW.email := NULL; END IF;
  END IF;
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(btrim(NEW.phone), '[\s\-()]', '', 'g');
    IF NEW.phone = '' THEN NEW.phone := NULL; END IF;
  END IF;
  IF NEW.customer_name IS NOT NULL THEN
    NEW.customer_name := btrim(NEW.customer_name);
  END IF;
  RETURN NEW;
END
$$;