CREATE TABLE IF NOT EXISTS public.erp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('xero','quickbooks','zoho_books','tally','generic')),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_currency text,
  last_sync_at timestamptz,
  last_status text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider)
);

CREATE TABLE IF NOT EXISTS public.erp_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.erp_connections(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer','invoice','product')),
  local_id uuid NOT NULL,
  external_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, entity_type, local_id)
);

CREATE TABLE IF NOT EXISTS public.erp_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid REFERENCES public.erp_connections(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'push',
  entity_type text NOT NULL,
  local_id uuid,
  external_id text,
  status text NOT NULL,
  message text,
  payload jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_sync_log_company_idx ON public.erp_sync_log (company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_connections TO authenticated;
GRANT ALL ON public.erp_connections TO service_role;
GRANT SELECT ON public.erp_entity_map TO authenticated;
GRANT ALL ON public.erp_entity_map TO service_role;
GRANT SELECT ON public.erp_sync_log TO authenticated;
GRANT ALL ON public.erp_sync_log TO service_role;

ALTER TABLE public.erp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "erp_connections_admin_manage" ON public.erp_connections FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())))
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "erp_entity_map_admin_read" ON public.erp_entity_map FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE POLICY "erp_sync_log_admin_read" ON public.erp_sync_log FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid())));

CREATE TRIGGER erp_connections_touch BEFORE UPDATE ON public.erp_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();