
ALTER TABLE public.crm_targets
  ADD COLUMN IF NOT EXISTS deals_target int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visits_target int NOT NULL DEFAULT 0;
