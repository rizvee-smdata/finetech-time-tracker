CREATE TABLE IF NOT EXISTS public.card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source TEXT,
  file_path TEXT NOT NULL,
  file_mime TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  extracted JSONB,
  confidence NUMERIC,
  industry_guess TEXT,
  language_detected TEXT,
  duplicate_lead_id UUID,
  linked_lead_id UUID,
  linked_customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_scans_company_idx ON public.card_scans(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_scans_user_idx ON public.card_scans(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_scans TO authenticated;
GRANT ALL ON public.card_scans TO service_role;

ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company card scans"
ON public.card_scans FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = card_scans.company_id AND cm.user_id = auth.uid()));

CREATE POLICY "Members can insert company card scans"
ON public.card_scans FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = card_scans.company_id AND cm.user_id = auth.uid())
);

CREATE POLICY "Members can update company card scans"
ON public.card_scans FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = card_scans.company_id AND cm.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = card_scans.company_id AND cm.user_id = auth.uid()));

CREATE POLICY "Owner or admin can delete card scans"
ON public.card_scans FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER card_scans_set_updated_at
BEFORE UPDATE ON public.card_scans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the existing private 'card-scans' bucket
CREATE POLICY "Members can read card-scans files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'card-scans'
  AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = cm.company_id::text
  )
);

CREATE POLICY "Members can upload card-scans files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'card-scans'
  AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = cm.company_id::text
  )
);

CREATE POLICY "Members can delete card-scans files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'card-scans'
  AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = cm.company_id::text
  )
);