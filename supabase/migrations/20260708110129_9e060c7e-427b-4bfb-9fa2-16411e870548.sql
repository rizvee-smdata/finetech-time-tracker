
-- Form Builder framework: per-company field defs + values across major entities

CREATE TYPE public.form_entity AS ENUM ('lead','customer','visit','expense','task','contract');
CREATE TYPE public.form_field_kind AS ENUM ('builtin','custom');
CREATE TYPE public.form_field_type AS ENUM (
  'text','textarea','number','select','multiselect',
  'date','datetime','boolean','file','user'
);

-- 1. Field definitions
CREATE TABLE public.form_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity public.form_entity NOT NULL,
  field_key text NOT NULL,
  field_kind public.form_field_kind NOT NULL DEFAULT 'custom',
  field_type public.form_field_type NOT NULL,
  label text NOT NULL,
  help_text text,
  placeholder text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_hidden boolean NOT NULL DEFAULT false,
  is_required_override boolean,
  is_system_locked boolean NOT NULL DEFAULT false,
  section text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_field_defs TO authenticated;
GRANT ALL ON public.form_field_defs TO service_role;
ALTER TABLE public.form_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read form field defs"
  ON public.form_field_defs FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage form field defs"
  ON public.form_field_defs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_form_field_defs_touch
  BEFORE UPDATE ON public.form_field_defs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_form_field_defs_company_entity ON public.form_field_defs (company_id, entity, sort_order);

-- 2. Custom field values (one row per record+field)
CREATE TABLE public.form_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity public.form_entity NOT NULL,
  entity_id uuid NOT NULL,
  field_def_id uuid NOT NULL REFERENCES public.form_field_defs(id) ON DELETE CASCADE,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (entity, entity_id, field_def_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_field_values TO authenticated;
GRANT ALL ON public.form_field_values TO service_role;
ALTER TABLE public.form_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read form values in their company"
  ON public.form_field_values FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members write form values in their company"
  ON public.form_field_values FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members update form values in their company"
  ON public.form_field_values FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members delete form values in their company"
  ON public.form_field_values FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_form_field_values_touch
  BEFORE UPDATE ON public.form_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_form_field_values_entity ON public.form_field_values (entity, entity_id);
CREATE INDEX idx_form_field_values_def ON public.form_field_values (field_def_id);

-- 3. File attachments referenced by form values
CREATE TABLE public.form_field_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id uuid NOT NULL REFERENCES public.form_field_values(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.form_field_files TO authenticated;
GRANT ALL ON public.form_field_files TO service_role;
ALTER TABLE public.form_field_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read form files in their company"
  ON public.form_field_files FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members add form files in their company"
  ON public.form_field_files FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members delete form files in their company"
  ON public.form_field_files FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- 4. Storage policies for the private form-uploads bucket.
-- Path convention: <company_id>/<entity>/<entity_id>/<file>
CREATE POLICY "Members read own company form uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'form-uploads'
    AND public.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "Members upload company form files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'form-uploads'
    AND public.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "Members delete company form files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'form-uploads'
    AND public.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

-- 5. Migrate legacy CRM custom field defs into the new unified table
INSERT INTO public.form_field_defs
  (company_id, entity, field_key, field_kind, field_type, label, is_hidden, sort_order, created_at)
SELECT
  company_id,
  'lead'::public.form_entity,
  field_key,
  'custom'::public.form_field_kind,
  CASE field_type
    WHEN 'number' THEN 'number'::public.form_field_type
    ELSE 'text'::public.form_field_type
  END,
  label,
  NOT is_active,
  sort_order,
  created_at
FROM public.crm_custom_field_defs
ON CONFLICT (company_id, entity, field_key) DO NOTHING;
