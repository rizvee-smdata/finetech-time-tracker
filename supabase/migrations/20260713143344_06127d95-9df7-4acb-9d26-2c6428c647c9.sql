
-- 1. lead_contacts: scope by parent lead access
DROP POLICY IF EXISTS "lead_contacts read" ON public.lead_contacts;
DROP POLICY IF EXISTS "lead_contacts write" ON public.lead_contacts;

CREATE POLICY "lead_contacts select" ON public.lead_contacts
  FOR SELECT USING (public.crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY "lead_contacts insert" ON public.lead_contacts
  FOR INSERT WITH CHECK (public.crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY "lead_contacts update" ON public.lead_contacts
  FOR UPDATE USING (public.crm_can_view_lead(auth.uid(), lead_id))
  WITH CHECK (public.crm_can_view_lead(auth.uid(), lead_id));
CREATE POLICY "lead_contacts delete" ON public.lead_contacts
  FOR DELETE USING (public.crm_can_view_lead(auth.uid(), lead_id));

-- 2. lead_email_summaries: scope by parent lead access
DROP POLICY IF EXISTS "lead_email_summaries read" ON public.lead_email_summaries;
CREATE POLICY "lead_email_summaries select" ON public.lead_email_summaries
  FOR SELECT USING (public.crm_can_view_lead(auth.uid(), lead_id));

-- 3. customers: require company_id and validate membership
DROP POLICY IF EXISTS "Customers insert" ON public.customers;
DROP POLICY IF EXISTS "Customers select" ON public.customers;
DROP POLICY IF EXISTS "Customers update" ON public.customers;
DROP POLICY IF EXISTS "Customers delete" ON public.customers;

CREATE POLICY "Customers select" ON public.customers
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "Customers insert" ON public.customers
  FOR INSERT WITH CHECK (
    company_id IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "Customers update" ON public.customers
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_company_member(auth.uid(), company_id))
  );
CREATE POLICY "Customers delete" ON public.customers
  FOR DELETE USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
  );

-- 4. time_entries: require company_id, scope to member/self
DROP POLICY IF EXISTS "Time insert" ON public.time_entries;
DROP POLICY IF EXISTS "Time select" ON public.time_entries;
DROP POLICY IF EXISTS "Time update" ON public.time_entries;

CREATE POLICY "Time select" ON public.time_entries
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      company_id IS NOT NULL
      AND public.is_company_member(auth.uid(), company_id)
      AND (auth.uid() = user_id OR public.is_staff(auth.uid()))
    )
  );
CREATE POLICY "Time insert" ON public.time_entries
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND company_id IS NOT NULL
    AND (public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY "Time update" ON public.time_entries
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND company_id IS NOT NULL);

-- 5. Storage: kb-attachments read scoped to article access
DROP POLICY IF EXISTS "kb_attachments authenticated read" ON storage.objects;
CREATE POLICY "kb_attachments scoped read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kb-attachments'
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.kb_articles a
        WHERE a.id::text = split_part(objects.name, '/', 1)
          AND a.published = true
      )
    )
  );

-- 6. Storage: tms-attachments insert must reference a task the user can view
DROP POLICY IF EXISTS "tms_att_storage_insert" ON storage.objects;
CREATE POLICY "tms_att_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'tms-attachments'
    AND owner = auth.uid()
    AND public.tms_can_view_task(
      auth.uid(),
      NULLIF(split_part(objects.name, '/', 1), '')::uuid
    )
  );
