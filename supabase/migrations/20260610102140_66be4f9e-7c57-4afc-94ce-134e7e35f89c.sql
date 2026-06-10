ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS vendor_quotes jsonb NOT NULL DEFAULT '[]'::jsonb;