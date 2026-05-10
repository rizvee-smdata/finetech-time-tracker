-- Companies
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

-- Companies RLS
CREATE POLICY "Admins manage companies" ON public.companies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members view their companies" ON public.companies
FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));

-- Company members RLS
CREATE POLICY "Admins manage memberships" ON public.company_members
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own memberships" ON public.company_members
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));

CREATE TRIGGER companies_set_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add company_id to data tables
ALTER TABLE public.customer_visits ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.customers       ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.time_entries    ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.reminders       ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX idx_visits_company   ON public.customer_visits(company_id);
CREATE INDEX idx_customers_company ON public.customers(company_id);
CREATE INDEX idx_time_company      ON public.time_entries(company_id);
CREATE INDEX idx_reminders_company ON public.reminders(company_id);

-- Tighten RLS: company membership required (admins still bypass via has_role)
DROP POLICY IF EXISTS "Insert own visits" ON public.customer_visits;
DROP POLICY IF EXISTS "View own or staff all visits" ON public.customer_visits;
DROP POLICY IF EXISTS "Update own visits or staff" ON public.customer_visits;
DROP POLICY IF EXISTS "Delete own visits or staff" ON public.customer_visits;

CREATE POLICY "Visits insert" ON public.customer_visits
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (company_id IS NULL OR public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
);
CREATE POLICY "Visits select" ON public.customer_visits
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR public.is_staff(auth.uid())))
  OR (company_id IS NULL AND auth.uid() = user_id)
);
CREATE POLICY "Visits update" ON public.customer_visits
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR public.is_staff(auth.uid())))
);
CREATE POLICY "Visits delete" ON public.customer_visits
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR public.is_staff(auth.uid())))
);

DROP POLICY IF EXISTS "View customers staff or own" ON public.customers;
DROP POLICY IF EXISTS "Staff insert customers" ON public.customers;
DROP POLICY IF EXISTS "Staff update customers" ON public.customers;
DROP POLICY IF EXISTS "Staff delete customers" ON public.customers;

CREATE POLICY "Customers select" ON public.customers
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
  OR (company_id IS NULL AND (public.is_staff(auth.uid()) OR auth.uid() = created_by))
);
CREATE POLICY "Customers insert" ON public.customers
FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff(auth.uid())
  AND (company_id IS NULL OR public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
);
CREATE POLICY "Customers update" ON public.customers
FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()));
CREATE POLICY "Customers delete" ON public.customers
FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Insert own time" ON public.time_entries;
DROP POLICY IF EXISTS "Update own time" ON public.time_entries;
DROP POLICY IF EXISTS "View own or staff all time" ON public.time_entries;

CREATE POLICY "Time insert" ON public.time_entries
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (company_id IS NULL OR public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
);
CREATE POLICY "Time update" ON public.time_entries
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Time select" ON public.time_entries
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND (auth.uid() = user_id OR public.is_staff(auth.uid())))
  OR (company_id IS NULL AND (auth.uid() = user_id OR public.is_staff(auth.uid())))
);

DROP POLICY IF EXISTS "Insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "View own or staff reminders" ON public.reminders;

CREATE POLICY "Reminders insert" ON public.reminders
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Reminders update" ON public.reminders
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Reminders select" ON public.reminders
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR auth.uid() = user_id
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
);