CREATE POLICY "checkins_media_user_rw" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'checkins-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role)))
  WITH CHECK (bucket_id = 'checkins-media' AND auth.uid()::text = (storage.foldername(name))[1]);