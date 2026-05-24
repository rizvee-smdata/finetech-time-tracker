
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present','late','absent','half_day','leave');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  work_start_time time NOT NULL DEFAULT '09:00',
  work_end_time time NOT NULL DEFAULT '18:00',
  late_threshold_minutes int NOT NULL DEFAULT 15 CHECK (late_threshold_minutes >= 0),
  half_day_after_minutes int NOT NULL DEFAULT 120 CHECK (half_day_after_minutes >= 0),
  geofence_lat double precision,
  geofence_lng double precision,
  geofence_radius_m int CHECK (geofence_radius_m IS NULL OR geofence_radius_m > 0),
  geofence_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  status public.attendance_status NOT NULL DEFAULT 'present',
  check_in_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_address text,
  check_in_distance_m int,
  check_in_within_geofence boolean,
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_address text,
  check_out_distance_m int,
  check_out_within_geofence boolean,
  total_minutes int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_user_date
  ON public.attendance_records(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_company_date
  ON public.attendance_records(company_id, work_date DESC);

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;

-- Settings
CREATE POLICY "Members read attendance settings" ON public.attendance_settings
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Admins write attendance settings" ON public.attendance_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id));

-- Records
CREATE POLICY "Rep reads own attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Staff reads team attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));
CREATE POLICY "Rep inserts own attendance" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Rep updates own attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff updates team attendance" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));

CREATE TRIGGER attendance_settings_set_updated_at
  BEFORE UPDATE ON public.attendance_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER attendance_records_set_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to compute total_minutes on check-out
CREATE OR REPLACE FUNCTION public.attendance_compute_total()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.check_out_at IS NOT NULL AND NEW.check_in_at IS NOT NULL THEN
    NEW.total_minutes := GREATEST(0, EXTRACT(EPOCH FROM (NEW.check_out_at - NEW.check_in_at))::int / 60);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER attendance_compute_total_trg
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_compute_total();
