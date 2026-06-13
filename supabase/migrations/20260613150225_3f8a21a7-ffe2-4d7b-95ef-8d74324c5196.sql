
CREATE POLICY "Admins manage backups read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage backups write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage backups update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage backups delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'::app_role));
