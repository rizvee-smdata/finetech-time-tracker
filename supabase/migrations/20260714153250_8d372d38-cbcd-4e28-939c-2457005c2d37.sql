-- Helper: same-company staff check for profiles / user_roles / company_members
CREATE OR REPLACE FUNCTION public.shares_company_with(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm_v
    JOIN public.company_members cm_t ON cm_v.company_id = cm_t.company_id
    WHERE cm_v.user_id = _viewer
      AND cm_t.user_id = _target
  );
$$;
GRANT EXECUTE ON FUNCTION public.shares_company_with(uuid, uuid) TO authenticated, anon;

-- ============ company_members ============
DROP POLICY IF EXISTS "Users view own memberships" ON public.company_members;
CREATE POLICY "Users view own memberships"
ON public.company_members FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
);

-- ============ profiles ============
DROP POLICY IF EXISTS "Profiles viewable by self or staff" ON public.profiles;
CREATE POLICY "Profiles viewable by self or staff"
ON public.profiles FOR SELECT
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.is_staff(auth.uid()) AND public.shares_company_with(auth.uid(), id))
);

-- ============ user_roles ============
DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.is_staff(auth.uid()) AND public.shares_company_with(auth.uid(), user_id))
);

-- ============ office_work_logs ============
DROP POLICY IF EXISTS "office_work_logs manager/admin read" ON public.office_work_logs;
CREATE POLICY "office_work_logs manager/admin read"
ON public.office_work_logs FOR SELECT
USING (
  (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND company_id IS NOT NULL
  AND public.is_company_member(auth.uid(), company_id)
);

-- ============ office_work_tasks ============
DROP POLICY IF EXISTS "office_work_tasks manager/admin read" ON public.office_work_tasks;
CREATE POLICY "office_work_tasks manager/admin read"
ON public.office_work_tasks FOR SELECT
USING (
  (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.office_work_logs l
    WHERE l.id = office_work_tasks.log_id
      AND l.company_id IS NOT NULL
      AND public.is_company_member(auth.uid(), l.company_id)
  )
);

-- ============ chat_channels ============
DROP POLICY IF EXISTS chat_channels_update ON public.chat_channels;
CREATE POLICY chat_channels_update
ON public.chat_channels FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR (public.is_staff(auth.uid()) AND public.is_company_member(auth.uid(), company_id))
);

-- ============ chat_channel_members ============
DROP POLICY IF EXISTS chat_members_delete ON public.chat_channel_members;
CREATE POLICY chat_members_delete
ON public.chat_channel_members FOR DELETE
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_channel_members.channel_id
        AND public.is_company_member(auth.uid(), c.company_id)
    )
  )
);

DROP POLICY IF EXISTS chat_members_update ON public.chat_channel_members;
CREATE POLICY chat_members_update
ON public.chat_channel_members FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = chat_channel_members.channel_id
        AND public.is_company_member(auth.uid(), c.company_id)
    )
  )
);

-- ============ kb_articles ============
DROP POLICY IF EXISTS "kb_articles staff manage" ON public.kb_articles;
CREATE POLICY "kb_articles staff manage"
ON public.kb_articles FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND company_id IS NOT NULL
    AND public.is_company_member(auth.uid(), company_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND company_id IS NOT NULL
    AND public.is_company_member(auth.uid(), company_id)
  )
);

-- kb_articles read policy already restricts unpublished to staff; tighten to same company
DROP POLICY IF EXISTS "kb_articles read published" ON public.kb_articles;
CREATE POLICY "kb_articles read published"
ON public.kb_articles FOR SELECT
USING (
  published = true
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.is_staff(auth.uid())
    AND company_id IS NOT NULL
    AND public.is_company_member(auth.uid(), company_id)
  )
);

-- ============ kb_article_versions ============
DROP POLICY IF EXISTS "kb_versions staff insert" ON public.kb_article_versions;
CREATE POLICY "kb_versions staff insert"
ON public.kb_article_versions FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.kb_articles a
    WHERE a.id = kb_article_versions.article_id
      AND public.is_staff(auth.uid())
      AND a.company_id IS NOT NULL
      AND public.is_company_member(auth.uid(), a.company_id)
  )
);

DROP POLICY IF EXISTS "kb_versions read scoped" ON public.kb_article_versions;
CREATE POLICY "kb_versions read scoped"
ON public.kb_article_versions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.kb_articles a
    WHERE a.id = kb_article_versions.article_id
      AND (
        a.published = true
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          public.is_staff(auth.uid())
          AND a.company_id IS NOT NULL
          AND public.is_company_member(auth.uid(), a.company_id)
        )
      )
  )
);

-- ============ reminders ============
DROP POLICY IF EXISTS "Reminders insert" ON public.reminders;
CREATE POLICY "Reminders insert"
ON public.reminders FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (company_id IS NULL OR public.is_company_member(auth.uid(), company_id))
);