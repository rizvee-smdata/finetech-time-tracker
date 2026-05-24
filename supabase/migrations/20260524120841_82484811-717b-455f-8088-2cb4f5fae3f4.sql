
-- ============ ENUMS ============
CREATE TYPE public.crm_priority AS ENUM ('low','medium','high');
CREATE TYPE public.crm_lead_source_v2 AS ENUM ('visit','referral','inbound','cold_call','manual','other');
CREATE TYPE public.crm_renewal_kind AS ENUM ('one_time','amc','subscription','retainer');
CREATE TYPE public.crm_approval_status AS ENUM ('not_requested','pending','approved','rejected');
CREATE TYPE public.crm_call_outcome AS ENUM ('interested','follow_up','not_interested','no_answer');

-- ============ TERRITORIES ============
CREATE TABLE public.crm_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE public.crm_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_terr_select ON public.crm_territories FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_terr_manage ON public.crm_territories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));
CREATE TRIGGER trg_crm_terr_updated BEFORE UPDATE ON public.crm_territories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ACCOUNTS ============
CREATE TABLE public.crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  industry text,
  website text,
  phone text,
  address text,
  territory_id uuid REFERENCES public.crm_territories(id) ON DELETE SET NULL,
  primary_owner uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_accounts_company ON public.crm_accounts(company_id);
ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_acc_select ON public.crm_accounts FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_acc_insert ON public.crm_accounts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_acc_update ON public.crm_accounts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND (is_staff(auth.uid()) OR primary_owner = auth.uid() OR created_by = auth.uid())));
CREATE POLICY crm_acc_delete ON public.crm_accounts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));
CREATE TRIGGER trg_crm_acc_updated BEFORE UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PRODUCT CATALOG ============
CREATE TABLE public.crm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text,
  description text,
  base_price numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'each',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_products_company ON public.crm_products(company_id);
ALTER TABLE public.crm_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_prod_select ON public.crm_products FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_prod_manage ON public.crm_products FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));
CREATE TRIGGER trg_crm_prod_updated BEFORE UPDATE ON public.crm_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ COMPETITORS (master list) ============
CREATE TABLE public.crm_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE public.crm_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_comp_select ON public.crm_competitors FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_comp_manage ON public.crm_competitors FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

-- ============ LEAD <-> PRODUCT JUNCTION ============
CREATE TABLE public.crm_lead_products (
  lead_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.crm_products(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, product_id)
);
ALTER TABLE public.crm_lead_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_lp_select ON public.crm_lead_products FOR SELECT TO authenticated
  USING (crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY crm_lp_manage ON public.crm_lead_products FOR ALL TO authenticated
  USING (crm_can_view_lead(auth.uid(), lead_id))
  WITH CHECK (crm_can_view_lead(auth.uid(), lead_id));

-- ============ QUOTE LINE ITEMS ============
CREATE TABLE public.crm_quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.crm_products(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qli_quote ON public.crm_quote_line_items(quote_id);
ALTER TABLE public.crm_quote_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_qli_select ON public.crm_quote_line_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND crm_can_view_lead(auth.uid(), q.lead_id)));
CREATE POLICY crm_qli_manage ON public.crm_quote_line_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND crm_can_view_lead(auth.uid(), q.lead_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND crm_can_view_lead(auth.uid(), q.lead_id)));

-- ============ DOCUMENT TEMPLATES ============
CREATE TABLE public.crm_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'proposal', -- proposal/nda/intro/other
  body text NOT NULL, -- markdown/HTML with {{placeholders}}
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_tpl_select ON public.crm_document_templates FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_company_member(auth.uid(), company_id));
CREATE POLICY crm_tpl_manage ON public.crm_document_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin') OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));
CREATE TRIGGER trg_crm_tpl_updated BEFORE UPDATE ON public.crm_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CALL LOGS ============
CREATE TABLE public.crm_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid,
  channel text NOT NULL DEFAULT 'call', -- call / whatsapp
  called_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes numeric,
  outcome public.crm_call_outcome,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_call_lead ON public.crm_call_logs(lead_id);
ALTER TABLE public.crm_call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_call_select ON public.crm_call_logs FOR SELECT TO authenticated
  USING (crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY crm_call_insert ON public.crm_call_logs FOR INSERT TO authenticated
  WITH CHECK (crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY crm_call_update ON public.crm_call_logs FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE POLICY crm_call_delete ON public.crm_call_logs FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- ============ CRM_LEADS additions ============
ALTER TABLE public.crm_leads
  ADD COLUMN priority public.crm_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN lead_source public.crm_lead_source_v2 NOT NULL DEFAULT 'manual',
  ADD COLUMN account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN territory_id uuid REFERENCES public.crm_territories(id) ON DELETE SET NULL,
  ADD COLUMN competitor_name text,
  ADD COLUMN competitor_price numeric,
  ADD COLUMN competitor_notes text,
  ADD COLUMN renewal_kind public.crm_renewal_kind NOT NULL DEFAULT 'one_time',
  ADD COLUMN renewal_date date,
  ADD COLUMN is_renewal boolean NOT NULL DEFAULT false,
  ADD COLUMN parent_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL;

-- ============ CRM_QUOTES additions (approval workflow) ============
ALTER TABLE public.crm_quotes
  ADD COLUMN discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN approval_status public.crm_approval_status NOT NULL DEFAULT 'not_requested',
  ADD COLUMN approval_requested_at timestamptz,
  ADD COLUMN approval_requested_by uuid,
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approval_comment text,
  ADD COLUMN subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN tax_pct numeric NOT NULL DEFAULT 0;

-- ============ Renewal auto-creator (60d before) ============
CREATE OR REPLACE FUNCTION public.crm_generate_renewal_leads()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  FOR l IN
    SELECT * FROM public.crm_leads
    WHERE stage = 'won'
      AND renewal_kind <> 'one_time'
      AND renewal_date IS NOT NULL
      AND renewal_date BETWEEN (current_date + INTERVAL '60 days')::date AND (current_date + INTERVAL '60 days')::date
      AND NOT EXISTS (
        SELECT 1 FROM public.crm_leads c
        WHERE c.parent_lead_id = crm_leads.id AND c.is_renewal = true
      )
  LOOP
    INSERT INTO public.crm_leads(
      company_id, source, customer_name, company_name, contact_person, phone, email,
      assigned_to, created_by, expected_value, currency, stage, priority, lead_source,
      account_id, territory_id, is_renewal, parent_lead_id, expected_close_date, notes
    ) VALUES (
      l.company_id, 'manual', l.customer_name, l.company_name, l.contact_person, l.phone, l.email,
      l.assigned_to, COALESCE(l.assigned_to, l.created_by), l.expected_value, l.currency,
      'new', l.priority, 'referral', l.account_id, l.territory_id, true, l.id, l.renewal_date,
      'Auto-generated renewal for ' || l.customer_name
    );
  END LOOP;
END $$;
