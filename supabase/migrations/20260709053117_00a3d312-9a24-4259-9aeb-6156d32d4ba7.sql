
-- 1. Add super_admin flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 2. Helper to check super_admin (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = _uid), false);
$$;

-- 3. Redefine has_role: when checking 'admin', only Super Admins qualify.
--    All other role checks (manager, employee) behave as before.
--    Effect: policies that grant a cross-company bypass via has_role(uid,'admin')
--    now only bypass for Super Admins. Company-scoped admins still pass via
--    the is_company_member/is_staff clauses that most policies already include.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _role = 'admin'::app_role THEN public.is_super_admin(_user_id)
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END;
$$;

-- 4. Open form_field_defs management to staff (admin+manager) within their company
DROP POLICY IF EXISTS "Admins manage form field defs" ON public.form_field_defs;
CREATE POLICY "Staff manage form field defs"
  ON public.form_field_defs
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id)))
  WITH CHECK (public.is_super_admin(auth.uid())
         OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id)));

-- 5. Update handle_new_user: first ever user also becomes super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    UPDATE public.profiles SET is_super_admin = true WHERE id = NEW.id;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Promote fazlur to super_admin
UPDATE public.profiles SET is_super_admin = true
  WHERE email = 'fazlur@smartdataltd.com';
