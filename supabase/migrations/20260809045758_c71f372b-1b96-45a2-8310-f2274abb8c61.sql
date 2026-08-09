CREATE OR REPLACE FUNCTION public.get_license_state(_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.licenses%ROWTYPE; st text; days int; used int; c_created timestamptz; boot_days int;
BEGIN
  IF _company IS NULL THEN RETURN jsonb_build_object('state','locked','reason','no_organization'); END IF;
  SELECT * INTO l FROM public.licenses
   WHERE organization_id = _company AND status IN ('active','issued','suspended','revoked','expired')
   ORDER BY (status = 'active') DESC, expires_at DESC NULLS FIRST LIMIT 1;
  IF NOT FOUND THEN
    SELECT created_at INTO c_created FROM public.companies WHERE id = _company;
    boot_days := 7 - GREATEST(0, (EXTRACT(EPOCH FROM (now() - COALESCE(c_created, now()))) / 86400)::int);
    IF boot_days > 0 THEN
      RETURN jsonb_build_object(
        'state','active','reason','unlicensed_bootstrap',
        'max_users', NULL, 'seats_used', public.license_seats_used(_company),
        'days_remaining', boot_days
      );
    END IF;
    RETURN jsonb_build_object('state','locked','reason','no_license');
  END IF;

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