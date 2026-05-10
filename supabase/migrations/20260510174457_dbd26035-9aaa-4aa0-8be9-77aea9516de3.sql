CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  contact_person text,
  designation text,
  email text,
  phone text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View customers staff or own"
ON public.customers FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()) OR auth.uid() = created_by);

CREATE POLICY "Staff insert customers"
ON public.customers FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff update customers"
ON public.customers FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff delete customers"
ON public.customers FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));

CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();