ALTER TABLE public.license_activation_attempts
  ADD COLUMN IF NOT EXISTS key_hash text,
  ADD COLUMN IF NOT EXISTS key_prefix text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS actor_email text;

CREATE INDEX IF NOT EXISTS license_activation_attempts_key_hash_idx
  ON public.license_activation_attempts (key_hash, created_at DESC);

GRANT ALL ON public.license_activation_attempts TO service_role;