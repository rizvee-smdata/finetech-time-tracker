
CREATE POLICY "kb_attachments authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kb-attachments');

CREATE POLICY "kb_attachments staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kb-attachments' AND public.is_staff(auth.uid()));

CREATE POLICY "kb_attachments staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'kb-attachments' AND public.is_staff(auth.uid()));

CREATE POLICY "kb_attachments staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kb-attachments' AND public.is_staff(auth.uid()));
