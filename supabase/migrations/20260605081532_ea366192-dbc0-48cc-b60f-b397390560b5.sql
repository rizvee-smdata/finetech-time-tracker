
-- Copilot Conversations
CREATE TABLE public.copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_conversations TO authenticated;
GRANT ALL ON public.copilot_conversations TO service_role;
ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own copilot conversations"
  ON public.copilot_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_copilot_conversations_updated_at
  BEFORE UPDATE ON public.copilot_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_copilot_conv_user ON public.copilot_conversations(user_id, updated_at DESC);

-- Copilot Messages
CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.copilot_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_messages TO authenticated;
GRANT ALL ON public.copilot_messages TO service_role;
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access messages in own conversations"
  ON public.copilot_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.copilot_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.copilot_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE INDEX idx_copilot_msg_conv ON public.copilot_messages(conversation_id, created_at);

-- Scheduled Reports
CREATE TABLE public.copilot_scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  question text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  delivery_method text NOT NULL CHECK (delivery_method IN ('in_app','whatsapp','email')),
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_result jsonb,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_scheduled_reports TO authenticated;
GRANT ALL ON public.copilot_scheduled_reports TO service_role;
ALTER TABLE public.copilot_scheduled_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scheduled reports"
  ON public.copilot_scheduled_reports FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_company_member(auth.uid(), company_id));
CREATE TRIGGER trg_copilot_scheduled_updated_at
  BEFORE UPDATE ON public.copilot_scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Anomalies
CREATE TABLE public.copilot_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  title text NOT NULL,
  description text NOT NULL,
  suggested_action text,
  target_user_id uuid,
  target_lead_id uuid,
  metadata jsonb,
  dismissed_at timestamptz,
  dismissed_by uuid,
  detected_for_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Dhaka')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_anomalies TO authenticated;
GRANT ALL ON public.copilot_anomalies TO service_role;
ALTER TABLE public.copilot_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view company anomalies"
  ON public.copilot_anomalies FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()));
CREATE POLICY "Managers update company anomalies"
  ON public.copilot_anomalies FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE INDEX idx_copilot_anomalies_company ON public.copilot_anomalies(company_id, dismissed_at, created_at DESC);
CREATE UNIQUE INDEX idx_copilot_anomalies_dedupe
  ON public.copilot_anomalies(company_id, kind, COALESCE(target_user_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(target_lead_id, '00000000-0000-0000-0000-000000000000'::uuid), detected_for_date);
