
CREATE TABLE IF NOT EXISTS public.permission_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  record_visibility text NOT NULL DEFAULT 'company' CHECK (record_visibility IN ('own','team','company')),
  hidden_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  readonly_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_profiles TO authenticated;
GRANT ALL ON public.permission_profiles TO service_role;
ALTER TABLE public.permission_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_profiles_select ON public.permission_profiles;
CREATE POLICY permission_profiles_select ON public.permission_profiles
  FOR SELECT TO authenticated
  USING (is_company_member(auth.uid(), company_id) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS permission_profiles_write ON public.permission_profiles;
CREATE POLICY permission_profiles_write ON public.permission_profiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND is_company_member(auth.uid(), company_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND is_company_member(auth.uid(), company_id));

CREATE TRIGGER permission_profiles_touch BEFORE UPDATE ON public.permission_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permission_profile_id uuid REFERENCES public.permission_profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.pp_record_scope(_user uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT pp.record_visibility
       FROM public.profiles p
       JOIN public.permission_profiles pp ON pp.id = p.permission_profile_id
      WHERE p.id = _user),
    'company');
$$;

CREATE OR REPLACE FUNCTION public.pp_field_rules(_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'profile_id', pp.id,
              'profile_name', pp.name,
              'record_visibility', pp.record_visibility,
              'hidden_fields', pp.hidden_fields,
              'readonly_fields', pp.readonly_fields)
       FROM public.profiles p
       JOIN public.permission_profiles pp ON pp.id = p.permission_profile_id
      WHERE p.id = _user),
    jsonb_build_object('record_visibility','company','hidden_fields','{}'::jsonb,'readonly_fields','{}'::jsonb));
$$;

REVOKE EXECUTE ON FUNCTION public.pp_record_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pp_field_rules(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.crm_can_view_lead(_user uuid, _lead uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id = _lead
      AND (
        has_role(_user, 'admin'::app_role)
        OR (
          is_company_member(_user, l.company_id)
          AND CASE public.pp_record_scope(_user)
                WHEN 'own' THEN (l.assigned_to = _user OR l.created_by = _user)
                WHEN 'team' THEN (l.assigned_to = _user OR l.created_by = _user
                                  OR public.reports_to_user(_user, l.assigned_to))
                ELSE (is_staff(_user) OR l.assigned_to = _user OR l.created_by = _user)
              END
        )
      )
  );
$$;

DROP POLICY IF EXISTS crm_leads_select ON public.crm_leads;
CREATE POLICY crm_leads_select ON public.crm_leads
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_company_member(auth.uid(), company_id)
      AND CASE public.pp_record_scope(auth.uid())
            WHEN 'own' THEN (assigned_to = auth.uid() OR created_by = auth.uid())
            WHEN 'team' THEN (assigned_to = auth.uid() OR created_by = auth.uid()
                              OR public.reports_to_user(auth.uid(), assigned_to))
            ELSE (is_staff(auth.uid()) OR assigned_to = auth.uid() OR created_by = auth.uid())
          END
    )
  );
