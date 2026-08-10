ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verify_failed_since timestamptz,
  ADD COLUMN IF NOT EXISTS remote_status text;