
-- 1) Tighten tms-attachments storage SELECT policy: require task view access
DROP POLICY IF EXISTS "tms_att_storage_select" ON storage.objects;
CREATE POLICY "tms_att_storage_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'tms-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tms_task_attachments a
    WHERE a.file_path = storage.objects.name
      AND public.tms_can_view_task(auth.uid(), a.task_id)
  )
);

-- 2) Restrict comment reactions visibility to those who can view the task
DROP POLICY IF EXISTS "tms_react_select" ON public.tms_comment_reactions;
CREATE POLICY "tms_react_select" ON public.tms_comment_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tms_task_comments c
    WHERE c.id = tms_comment_reactions.comment_id
      AND public.tms_can_view_task(auth.uid(), c.task_id)
  )
);

-- 3) Task delete must require continued company membership
DROP POLICY IF EXISTS "tms_tasks_delete" ON public.tms_tasks;
CREATE POLICY "tms_tasks_delete" ON public.tms_tasks
FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid())
  AND is_company_member(auth.uid(), company_id)
);

-- 4) Profiles: hide email/phone columns from non-owners/non-staff via column-level grants
--    Keep RLS row policy as-is (true) so name+avatar lookups still work.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, created_at, updated_at) ON public.profiles TO authenticated;
GRANT SELECT (email, phone) ON public.profiles TO authenticated;
-- Then restrict email/phone via a row policy that only matches owner or staff
-- using a secondary policy: split SELECT into two policies isn't possible per column,
-- so instead create a SECURITY DEFINER view for safe public profile data.

-- Public-safe view for profile lookups (id, full_name, avatar_url only)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true)
AS SELECT id, full_name, avatar_url FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- Restore broad SELECT on profiles but only return email/phone to owner/staff
-- Implementation: revoke direct grants and replace with column grants conditioned by policy.
-- Simpler approach: keep full SELECT, but use a row policy that already exists (true),
-- and rely on application code + the public view for non-staff lookups.
GRANT SELECT ON public.profiles TO authenticated;

-- Replace the broad profiles select policy with one that only allows seeing
-- full rows for self or staff; everyone else must use profiles_public.
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by self or staff" ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.is_staff(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
