
CREATE TABLE public.company_gmail_config (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  workspace_domain text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_gmail_config TO authenticated;
GRANT ALL ON public.company_gmail_config TO service_role;

ALTER TABLE public.company_gmail_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view gmail config"
  ON public.company_gmail_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can manage gmail config"
  ON public.company_gmail_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_company_gmail_config_updated
  BEFORE UPDATE ON public.company_gmail_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.gmail_accounts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_company ON public.gmail_accounts(company_id);
