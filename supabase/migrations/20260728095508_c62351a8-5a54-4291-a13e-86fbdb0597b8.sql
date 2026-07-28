
-- Enums
DO $$ BEGIN CREATE TYPE public.license_edition AS ENUM ('time_tracker','crm','suite'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.license_status AS ENUM ('issued','active','suspended','revoked','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.license_event_type AS ENUM ('generated','activated','renewed','seats_changed','suspended','revoked','reinstated','expired','entered_grace','entered_read_only','reminder_sent','replacement_issued'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seat deactivation flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash text NOT NULL UNIQUE,
  key_prefix text,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  edition public.license_edition NOT NULL DEFAULT 'suite',
  max_users int,
  term_months int,
  starts_at date NOT NULL DEFAULT current_date,
  expires_at date,
  grace_days int NOT NULL DEFAULT 14,
  status public.license_status NOT NULL DEFAULT 'issued',
  organization_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  parent_license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  is_renewal_key boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_org_idx ON public.licenses(organization_id);
CREATE INDEX IF NOT EXISTS licenses_expiry_idx ON public.licenses(expires_at);

CREATE TABLE IF NOT EXISTS public.license_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  event_type public.license_event_type NOT NULL,
  actor uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS license_events_license_idx ON public.license_events(license_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.license_activation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor uuid,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
GRANT SELECT ON public.license_events TO authenticated;
GRANT ALL ON public.license_events TO service_role;
GRANT ALL ON public.license_activation_attempts TO service_role;

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_activation_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read own license" ON public.licenses;
CREATE POLICY "org members read own license" ON public.licenses
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_company_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "org members read own license events" ON public.license_events;
CREATE POLICY "org members read own license events" ON public.license_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.licenses l
    WHERE l.id = license_events.license_id
      AND l.organization_id IS NOT NULL
      AND public.is_company_member(auth.uid(), l.organization_id)
  ));

-- Seat usage
CREATE OR REPLACE FUNCTION public.license_seats_used(_company uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.company_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.company_id = _company AND coalesce(p.is_active, true);
$$;

-- License state for an organization
CREATE OR REPLACE FUNCTION public.get_license_state(_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.licenses%ROWTYPE; st text; days int; used int;
BEGIN
  IF _company IS NULL THEN RETURN jsonb_build_object('state','locked','reason','no_organization'); END IF;
  SELECT * INTO l FROM public.licenses
   WHERE organization_id = _company AND status IN ('active','issued','suspended','revoked','expired')
   ORDER BY (status = 'active') DESC, expires_at DESC NULLS FIRST LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','locked','reason','no_license'); END IF;

  used := public.license_seats_used(_company);

  IF l.status IN ('suspended','revoked') THEN
    st := 'locked';
    days := NULL;
  ELSIF l.expires_at IS NULL THEN
    st := 'active';
  ELSE
    days := (l.expires_at - (now() AT TIME ZONE 'utc')::date);
    IF days >= 30 THEN st := 'active';
    ELSIF days >= 0 THEN st := 'expiring_soon';
    ELSIF days >= -l.grace_days THEN st := 'in_grace';
    ELSE st := 'read_only';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'state', st,
    'license_id', l.id,
    'edition', l.edition,
    'status', l.status,
    'max_users', l.max_users,
    'seats_used', used,
    'starts_at', l.starts_at,
    'expires_at', l.expires_at,
    'grace_days', l.grace_days,
    'days_remaining', days,
    'customer_name', l.customer_name
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_license_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.license_seats_used(uuid) TO authenticated, service_role;

-- Daily status transitions
CREATE OR REPLACE FUNCTION public.license_daily_transition()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int := 0; r record;
BEGIN
  FOR r IN
    SELECT * FROM public.licenses
    WHERE status = 'active' AND expires_at IS NOT NULL
      AND expires_at < (now() AT TIME ZONE 'utc')::date
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.license_events e WHERE e.license_id = r.id AND e.event_type = 'expired') THEN
      INSERT INTO public.license_events(license_id, event_type, details)
      VALUES (r.id, 'expired', jsonb_build_object('expires_at', r.expires_at));
      INSERT INTO public.license_events(license_id, event_type, details)
      VALUES (r.id, 'entered_grace', jsonb_build_object('grace_days', r.grace_days));
      n := n + 1;
    END IF;
    IF (now() AT TIME ZONE 'utc')::date > r.expires_at + r.grace_days
       AND NOT EXISTS (SELECT 1 FROM public.license_events e WHERE e.license_id = r.id AND e.event_type = 'entered_read_only') THEN
      INSERT INTO public.license_events(license_id, event_type, details)
      VALUES (r.id, 'entered_read_only', '{}'::jsonb);
      UPDATE public.licenses SET status = 'expired', updated_at = now() WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

DROP TRIGGER IF EXISTS licenses_touch ON public.licenses;
CREATE TRIGGER licenses_touch BEFORE UPDATE ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
