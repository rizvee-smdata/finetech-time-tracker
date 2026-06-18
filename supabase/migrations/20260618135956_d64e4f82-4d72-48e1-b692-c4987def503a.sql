
DROP POLICY IF EXISTS "card-scans authenticated read"   ON storage.objects;
DROP POLICY IF EXISTS "card-scans authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "card-scans authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "card-scans authenticated delete" ON storage.objects;

DROP POLICY IF EXISTS "crm_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "crm_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "crm_storage_delete" ON storage.objects;

CREATE POLICY "crm_storage_select_company" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-attachments'
  AND EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_company_member(auth.uid(), l.company_id)
      )
  )
);

CREATE POLICY "crm_storage_insert_company" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-attachments'
  AND EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_company_member(auth.uid(), l.company_id)
      )
  )
);

CREATE POLICY "crm_storage_delete_company" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-attachments'
  AND EXISTS (
    SELECT 1 FROM public.crm_leads l
    WHERE l.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_company_member(auth.uid(), l.company_id)
      )
  )
);

DROP POLICY IF EXISTS "kb_versions read" ON public.kb_article_versions;
CREATE POLICY "kb_versions read scoped" ON public.kb_article_versions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kb_articles a
    WHERE a.id = kb_article_versions.article_id
      AND (a.published = true OR public.is_staff(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff view company predictions" ON public.prediction_runs;
CREATE POLICY "Staff view company predictions" ON public.prediction_runs
FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  AND public.is_company_member(auth.uid(), company_id)
);

ALTER FUNCTION public.enqueue_email(text, jsonb)               SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint)               SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   SET search_path = public, pgmq;
