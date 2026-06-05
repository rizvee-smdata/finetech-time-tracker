ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS visit_backdate_days integer NOT NULL DEFAULT 2
  CHECK (visit_backdate_days >= 0 AND visit_backdate_days <= 30);