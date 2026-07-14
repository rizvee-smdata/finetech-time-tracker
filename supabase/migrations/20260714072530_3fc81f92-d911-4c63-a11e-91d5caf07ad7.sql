
-- === Multi-currency support ===

-- 1. Currencies reference table
CREATE TABLE public.currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals SMALLINT NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currencies TO anon, authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currencies readable by everyone" ON public.currencies FOR SELECT USING (true);

INSERT INTO public.currencies (code, name, symbol) VALUES
  ('USD','US Dollar','$'),
  ('EUR','Euro','€'),
  ('GBP','British Pound','£'),
  ('JPY','Japanese Yen','¥'),
  ('AUD','Australian Dollar','A$'),
  ('CAD','Canadian Dollar','C$'),
  ('CHF','Swiss Franc','CHF'),
  ('CNY','Chinese Yuan','¥'),
  ('INR','Indian Rupee','₹'),
  ('SGD','Singapore Dollar','S$'),
  ('HKD','Hong Kong Dollar','HK$'),
  ('AED','UAE Dirham','AED'),
  ('SAR','Saudi Riyal','SAR'),
  ('TTD','Trinidad & Tobago Dollar','TT$'),
  ('BRL','Brazilian Real','R$'),
  ('MXN','Mexican Peso','MX$'),
  ('ZAR','South African Rand','R')
ON CONFLICT (code) DO NOTHING;

-- 2. Exchange rates — from_code -> to_code as of a date
CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code TEXT NOT NULL REFERENCES public.currencies(code),
  to_code TEXT NOT NULL REFERENCES public.currencies(code),
  rate NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  as_of DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_code, to_code, as_of)
);
CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates(from_code, to_code, as_of DESC);
GRANT SELECT ON public.exchange_rates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exchange_rates readable" ON public.exchange_rates FOR SELECT USING (true);
CREATE POLICY "admins manage exchange_rates" ON public.exchange_rates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed identity rates + a few defaults (as-of today; users override)
INSERT INTO public.exchange_rates (from_code, to_code, rate, source) VALUES
  ('USD','USD',1,'seed'),('EUR','EUR',1,'seed'),('GBP','GBP',1,'seed'),
  ('TTD','TTD',1,'seed'),('INR','INR',1,'seed'),('AED','AED',1,'seed'),
  ('USD','EUR',0.92,'seed'),('EUR','USD',1.09,'seed'),
  ('USD','GBP',0.79,'seed'),('GBP','USD',1.27,'seed'),
  ('USD','TTD',6.78,'seed'),('TTD','USD',0.147,'seed'),
  ('USD','INR',83.2,'seed'),('INR','USD',0.012,'seed'),
  ('USD','AED',3.67,'seed'),('AED','USD',0.272,'seed')
ON CONFLICT (from_code, to_code, as_of) DO NOTHING;

-- 3. Base currency per company
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code);

-- 4. Add currency_code to money-bearing tables
ALTER TABLE public.crm_leads         ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.crm_quotes        ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.crm_quote_line_items ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.contracts         ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.contract_payments ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.expenses          ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);
ALTER TABLE public.crm_targets       ADD COLUMN IF NOT EXISTS currency_code TEXT REFERENCES public.currencies(code);

-- 5. Conversion helper: latest rate on or before a date
CREATE OR REPLACE FUNCTION public.fx_convert(_amount NUMERIC, _from TEXT, _to TEXT, _as_of DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _amount IS NULL OR _from IS NULL OR _to IS NULL THEN _amount
    WHEN _from = _to THEN _amount
    ELSE _amount * COALESCE(
      (SELECT rate FROM public.exchange_rates
        WHERE from_code = _from AND to_code = _to AND as_of <= _as_of
        ORDER BY as_of DESC LIMIT 1),
      -- fall back to inverse if only the other direction exists
      (SELECT 1/rate FROM public.exchange_rates
        WHERE from_code = _to AND to_code = _from AND as_of <= _as_of
        ORDER BY as_of DESC LIMIT 1),
      1
    )
  END;
$$;
