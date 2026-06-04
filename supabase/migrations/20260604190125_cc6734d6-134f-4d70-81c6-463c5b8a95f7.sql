-- 1. Geo columns on crm_leads
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS address_lat float8,
  ADD COLUMN IF NOT EXISTS address_lng float8,
  ADD COLUMN IF NOT EXISTS address_text text;

-- 2. visit_checkins
CREATE TABLE IF NOT EXISTS public.visit_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  client_name text,
  checkin_lat float8 NOT NULL,
  checkin_lng float8 NOT NULL,
  checkin_time timestamptz NOT NULL DEFAULT now(),
  checkout_time timestamptz,
  checkout_lat float8,
  checkout_lng float8,
  selfie_url text,
  voice_url text,
  distance_from_client_m float8,
  is_geofence_valid boolean NOT NULL DEFAULT true,
  override_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_checkins TO authenticated;
GRANT ALL ON public.visit_checkins TO service_role;
ALTER TABLE public.visit_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkins_select_own_or_staff" ON public.visit_checkins FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_staff(auth.uid()) AND is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "checkins_insert_own" ON public.visit_checkins FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));
CREATE POLICY "checkins_update_own_or_staff" ON public.visit_checkins FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_staff(auth.uid()) AND is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "checkins_delete_own_or_admin" ON public.visit_checkins FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS visit_checkins_user_time_idx ON public.visit_checkins (user_id, checkin_time DESC);
CREATE INDEX IF NOT EXISTS visit_checkins_company_time_idx ON public.visit_checkins (company_id, checkin_time DESC);

CREATE TRIGGER trg_visit_checkins_touch BEFORE UPDATE ON public.visit_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. daily_routes
CREATE TABLE IF NOT EXISTS public.daily_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_date date NOT NULL,
  total_km float8 NOT NULL DEFAULT 0,
  visit_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, route_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_routes TO authenticated;
GRANT ALL ON public.daily_routes TO service_role;
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_routes_select_own_or_staff" ON public.daily_routes FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_staff(auth.uid()) AND is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "daily_routes_upsert_own" ON public.daily_routes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_company_member(auth.uid(), company_id));
CREATE POLICY "daily_routes_update_own_or_staff" ON public.daily_routes FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (is_staff(auth.uid()) AND is_company_member(auth.uid(), company_id))
  );

CREATE TRIGGER trg_daily_routes_touch BEFORE UPDATE ON public.daily_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();