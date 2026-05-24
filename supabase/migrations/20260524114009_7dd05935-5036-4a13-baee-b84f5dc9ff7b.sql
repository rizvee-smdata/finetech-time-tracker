ALTER TABLE public.crm_leads ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE public.crm_quotes ALTER COLUMN currency SET DEFAULT 'USD';
UPDATE public.crm_leads SET currency = 'USD' WHERE currency = 'INR';
UPDATE public.crm_quotes SET currency = 'USD' WHERE currency = 'INR';