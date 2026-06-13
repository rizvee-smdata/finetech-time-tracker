
CREATE POLICY "card-scans authenticated read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'card-scans');
CREATE POLICY "card-scans authenticated insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'card-scans');
CREATE POLICY "card-scans authenticated update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'card-scans');
CREATE POLICY "card-scans authenticated delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'card-scans');
