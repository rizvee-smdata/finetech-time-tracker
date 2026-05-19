DROP POLICY IF EXISTS "tms_att_storage_delete" ON storage.objects;

CREATE POLICY "tms_att_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'tms-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tms_task_attachments a
    WHERE a.file_path = storage.objects.name
      AND public.tms_can_view_task(auth.uid(), a.task_id)
  )
);