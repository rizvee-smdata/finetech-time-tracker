
-- Storage RLS for chat-attachments
-- Path convention: {channel_id}/{filename}
CREATE POLICY "chat_attachments_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.chat_can_access_channel(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "chat_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.chat_can_access_channel(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "chat_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND owner = auth.uid()
  );
