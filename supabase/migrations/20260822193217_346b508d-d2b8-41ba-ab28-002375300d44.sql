ALTER TABLE public.crm_custom_field_defs
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.crm_custom_field_defs
  DROP CONSTRAINT IF EXISTS crm_custom_field_defs_field_type_check;

ALTER TABLE public.crm_custom_field_defs
  ADD CONSTRAINT crm_custom_field_defs_field_type_check
  CHECK (field_type = ANY (ARRAY['text','number','select','multiselect','date']));