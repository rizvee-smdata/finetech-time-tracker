
-- voice_inputs table
CREATE TABLE public.voice_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID,
  audio_path TEXT,
  duration_seconds INTEGER,
  transcript_bn TEXT,
  transcript_en TEXT,
  detected_language TEXT,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  linked_visit_id UUID,
  linked_task_ids UUID[],
  linked_contact_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_inputs TO authenticated;
GRANT ALL ON public.voice_inputs TO service_role;

ALTER TABLE public.voice_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own voice inputs"
  ON public.voice_inputs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX voice_inputs_user_created_idx ON public.voice_inputs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.voice_inputs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER voice_inputs_updated_at
  BEFORE UPDATE ON public.voice_inputs
  FOR EACH ROW EXECUTE FUNCTION public.voice_inputs_set_updated_at();

-- Storage RLS for voice-recordings bucket: users access only their own folder (prefix = auth.uid())
CREATE POLICY "Users read own voice recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own voice recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own voice recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own voice recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'voice-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
