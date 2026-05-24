
CREATE TYPE public.quote_share_response AS ENUM ('accepted','revision_requested');

CREATE TABLE public.crm_quote_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.crm_quotes(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  response public.quote_share_response,
  response_comment TEXT,
  client_name TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_quote_shares_quote_idx ON public.crm_quote_shares(quote_id);

CREATE TABLE public.crm_quote_share_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES public.crm_quote_shares(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  location TEXT
);
CREATE INDEX crm_quote_share_views_share_idx ON public.crm_quote_share_views(share_id, viewed_at DESC);

ALTER TABLE public.crm_quote_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_quote_share_views ENABLE ROW LEVEL SECURITY;

-- Reuse the quote view permission helper
CREATE POLICY "view shares via quote" ON public.crm_quote_shares FOR SELECT
USING (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND public.crm_can_view_lead(auth.uid(), q.lead_id)));
CREATE POLICY "manage shares via quote" ON public.crm_quote_shares FOR ALL
USING (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND public.crm_can_view_lead(auth.uid(), q.lead_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.crm_quotes q WHERE q.id = quote_id AND public.crm_can_view_lead(auth.uid(), q.lead_id)));

CREATE POLICY "view share views" ON public.crm_quote_share_views FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.crm_quote_shares s JOIN public.crm_quotes q ON q.id = s.quote_id
  WHERE s.id = share_id AND public.crm_can_view_lead(auth.uid(), q.lead_id)
));
