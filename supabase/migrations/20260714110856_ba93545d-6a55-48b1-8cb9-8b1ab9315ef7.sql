
DO $$ BEGIN
  CREATE TYPE public.custom_object_field_kind AS ENUM (
    'text','textarea','number','date','datetime','boolean',
    'select','multiselect','url','email','phone','reference'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.custom_object_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  api_name text NOT NULL,
  label text NOT NULL,
  plural_label text NOT NULL,
  icon text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, api_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_object_defs TO authenticated;
GRANT ALL ON public.custom_object_defs TO service_role;
ALTER TABLE public.custom_object_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_defs_read_company" ON public.custom_object_defs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_members m
  WHERE m.company_id = custom_object_defs.company_id AND m.user_id = auth.uid()));

CREATE POLICY "co_defs_manage_admin" ON public.custom_object_defs FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TABLE public.custom_object_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.custom_object_defs(id) ON DELETE CASCADE,
  api_name text NOT NULL,
  label text NOT NULL,
  kind public.custom_object_field_kind NOT NULL,
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_object_id uuid REFERENCES public.custom_object_defs(id) ON DELETE SET NULL,
  order_index int NOT NULL DEFAULT 0,
  help_text text,
  is_name_field boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_id, api_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_object_field_defs TO authenticated;
GRANT ALL ON public.custom_object_field_defs TO service_role;
ALTER TABLE public.custom_object_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_fields_read_company" ON public.custom_object_field_defs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.custom_object_defs d
  JOIN public.company_members m ON m.company_id = d.company_id
  WHERE d.id = custom_object_field_defs.object_id AND m.user_id = auth.uid()
));

CREATE POLICY "co_fields_manage_admin" ON public.custom_object_field_defs FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TABLE public.custom_object_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.custom_object_defs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_co_records_object ON public.custom_object_records(object_id);
CREATE INDEX idx_co_records_company ON public.custom_object_records(company_id);
CREATE INDEX idx_co_records_owner ON public.custom_object_records(owner_id);
CREATE INDEX idx_co_records_data ON public.custom_object_records USING gin(data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_object_records TO authenticated;
GRANT ALL ON public.custom_object_records TO service_role;
ALTER TABLE public.custom_object_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "co_records_read_company" ON public.custom_object_records FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_members m
  WHERE m.company_id = custom_object_records.company_id AND m.user_id = auth.uid()));

CREATE POLICY "co_records_insert_company" ON public.custom_object_records FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.company_members m
  WHERE m.company_id = custom_object_records.company_id AND m.user_id = auth.uid()));

CREATE POLICY "co_records_update" ON public.custom_object_records FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR owner_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR owner_id = auth.uid());

CREATE POLICY "co_records_delete" ON public.custom_object_records FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR owner_id = auth.uid());

CREATE TRIGGER trg_co_defs_updated BEFORE UPDATE ON public.custom_object_defs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
CREATE TRIGGER trg_co_fields_updated BEFORE UPDATE ON public.custom_object_field_defs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
CREATE TRIGGER trg_co_records_updated BEFORE UPDATE ON public.custom_object_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.custom_object_records_derive_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE name_key text;
BEGIN
  SELECT api_name INTO name_key FROM public.custom_object_field_defs
  WHERE object_id = NEW.object_id AND is_name_field = true LIMIT 1;
  IF name_key IS NOT NULL THEN
    NEW.name := COALESCE(NULLIF(NEW.data ->> name_key,''), NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_co_records_derive_name
BEFORE INSERT OR UPDATE ON public.custom_object_records
FOR EACH ROW EXECUTE FUNCTION public.custom_object_records_derive_name();
