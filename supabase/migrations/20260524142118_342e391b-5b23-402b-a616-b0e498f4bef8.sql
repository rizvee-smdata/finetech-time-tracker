
CREATE TYPE public.contract_type AS ENUM ('one_time','amc','retainer');
CREATE TYPE public.contract_status AS ENUM ('active','expired','cancelled','draft');
CREATE TYPE public.payment_status AS ENUM ('pending','invoiced','received','cancelled');

CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  account_id UUID,
  user_id UUID NOT NULL,
  contract_number TEXT NOT NULL,
  title TEXT,
  contract_type public.contract_type NOT NULL DEFAULT 'one_time',
  status public.contract_status NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  end_date DATE,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BDT',
  payment_terms TEXT,
  file_path TEXT,
  file_name TEXT,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, contract_number)
);
CREATE INDEX contracts_company_idx ON public.contracts(company_id, status);
CREATE INDEX contracts_lead_idx ON public.contracts(lead_id);

CREATE TABLE public.contract_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  invoice_number TEXT,
  received_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contract_payments_contract_idx ON public.contract_payments(contract_id, due_date);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view contracts" ON public.contracts FOR SELECT
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_company_member(auth.uid(), company_id));

CREATE POLICY "manage contracts" ON public.contracts FOR INSERT
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role))
);
CREATE POLICY "update contracts" ON public.contracts FOR UPDATE
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
);
CREATE POLICY "delete contracts" ON public.contracts FOR DELETE
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
);

CREATE POLICY "view payments" ON public.contract_payments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND (
  public.has_role(auth.uid(),'admin'::app_role) OR public.is_company_member(auth.uid(), c.company_id)
)));
CREATE POLICY "manage payments" ON public.contract_payments FOR ALL
USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND (
  public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), c.company_id) AND public.is_staff(auth.uid()))
  OR c.user_id = auth.uid()
)))
WITH CHECK (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = contract_id AND (
  public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), c.company_id) AND public.is_staff(auth.uid()))
  OR c.user_id = auth.uid()
)));

CREATE TRIGGER set_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_contract_payments_updated_at
BEFORE UPDATE ON public.contract_payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
