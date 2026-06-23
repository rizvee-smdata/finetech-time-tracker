DROP POLICY IF EXISTS "Members can insert company card scans" ON public.card_scans;
DROP POLICY IF EXISTS "Members can view company card scans" ON public.card_scans;
DROP POLICY IF EXISTS "Members can update company card scans" ON public.card_scans;
DROP POLICY IF EXISTS "Owner or admin can delete card scans" ON public.card_scans;

CREATE POLICY "Authorized users can insert company card scans"
ON public.card_scans
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_company_member(auth.uid(), company_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Authorized users can view company card scans"
ON public.card_scans
FOR SELECT
TO authenticated
USING (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Authorized users can update company card scans"
ON public.card_scans
FOR UPDATE
TO authenticated
USING (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Owner or admin can delete card scans"
ON public.card_scans
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Members can upload card-scans files" ON storage.objects;
DROP POLICY IF EXISTS "Members can read card-scans files" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete card-scans files" ON storage.objects;

CREATE POLICY "Authorized users can upload card-scans files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'card-scans'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  )
);

CREATE POLICY "Authorized users can read card-scans files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'card-scans'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  )
);

CREATE POLICY "Authorized users can delete card-scans files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'card-scans'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  )
);