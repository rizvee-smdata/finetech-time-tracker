
CREATE TYPE public.trial_request_status AS ENUM (
  'pending_email_verification',
  'pending_approval',
  'approved',
  'rejected'
);

CREATE TABLE public.trial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  work_email text NOT NULL,
  company_name text NOT NULL,
  phone text,
  country text,
  team_size text,
  notes text,
  status public.trial_request_status NOT NULL DEFAULT 'pending_email_verification',
  verification_token text UNIQUE,
  email_verified_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trial_ends_at timestamptz,
  submitted_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trial_requests_status_idx ON public.trial_requests(status, created_at DESC);
CREATE INDEX trial_requests_email_idx ON public.trial_requests(lower(work_email));

GRANT INSERT ON public.trial_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.trial_requests TO authenticated;
GRANT ALL ON public.trial_requests TO service_role;

ALTER TABLE public.trial_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a trial request"
  ON public.trial_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending_email_verification');

CREATE POLICY "Super admins can view all trial requests"
  ON public.trial_requests FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Requester can view own trial request"
  ON public.trial_requests FOR SELECT
  TO authenticated
  USING (
    lower(work_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

CREATE POLICY "Super admins can update trial requests"
  ON public.trial_requests FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trial_requests_touch
  BEFORE UPDATE ON public.trial_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
