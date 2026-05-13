ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'customer';
ALTER TABLE public.customers ADD CONSTRAINT customers_kind_check CHECK (kind IN ('customer','partner','consultant'));
CREATE INDEX IF NOT EXISTS idx_customers_kind ON public.customers(company_id, kind);

ALTER TABLE public.customer_visits ADD COLUMN IF NOT EXISTS contact_type text NOT NULL DEFAULT 'customer';
ALTER TABLE public.customer_visits ADD CONSTRAINT customer_visits_contact_type_check CHECK (contact_type IN ('customer','partner','consultant'));