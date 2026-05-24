-- Expense status enum
CREATE TYPE public.expense_status AS ENUM ('draft','submitted','approved','rejected');

-- Categories (per company)
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  auto_approve_limit numeric,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY exp_cat_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), company_id));
CREATE POLICY exp_cat_manage ON public.expense_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE TRIGGER exp_cat_touch BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Approver assignments
CREATE TABLE public.expense_approver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rep_id uuid NOT NULL,
  approver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, rep_id)
);
ALTER TABLE public.expense_approver_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY exp_appr_select ON public.expense_approver_assignments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), company_id));
CREATE POLICY exp_appr_manage ON public.expense_approver_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid,
  category_name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  expense_date date NOT NULL DEFAULT current_date,
  description text,
  visit_id uuid,
  lead_id uuid,
  receipt_path text,
  status public.expense_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  reviewer_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_company_idx ON public.expenses(company_id);
CREATE INDEX expenses_user_idx ON public.expenses(user_id);
CREATE INDEX expenses_status_idx ON public.expenses(status);
CREATE INDEX expenses_date_idx ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR user_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (has_role(auth.uid(),'admin'::app_role) OR is_company_member(auth.uid(), company_id))
  );

CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (user_id = auth.uid() AND status IN ('draft','rejected'))
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  );

CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (user_id = auth.uid() AND status = 'draft')
  );

CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts','expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY exp_rcpt_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
      OR is_staff(auth.uid())
    )
  );

CREATE POLICY exp_rcpt_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY exp_rcpt_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      has_role(auth.uid(),'admin'::app_role)
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );