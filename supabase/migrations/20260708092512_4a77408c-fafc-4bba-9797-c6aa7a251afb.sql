
-- ============ Gmail-to-Lead integration schema ============

-- 1) lead_contacts: multiple email contacts per lead for Gmail matching
CREATE TABLE public.lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  name text,
  email text NOT NULL,
  designation text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, email)
);
CREATE INDEX idx_lead_contacts_lead ON public.lead_contacts(lead_id);
CREATE INDEX idx_lead_contacts_email ON public.lead_contacts(email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contacts TO authenticated;
GRANT ALL ON public.lead_contacts TO service_role;
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_contacts read" ON public.lead_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_contacts write" ON public.lead_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lowercase-normalize email on insert/update
CREATE OR REPLACE FUNCTION public.lead_contacts_normalize_email()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  NEW.updated_at = now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_lead_contacts_normalize
  BEFORE INSERT OR UPDATE ON public.lead_contacts
  FOR EACH ROW EXECUTE FUNCTION public.lead_contacts_normalize_email();

-- 2) gmail_accounts: per-user OAuth tokens (owner-only readable)
CREATE TABLE public.gmail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_address text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  history_id text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','error','disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gmail_accounts_status ON public.gmail_accounts(status);
GRANT SELECT ON public.gmail_accounts TO authenticated;
GRANT ALL ON public.gmail_accounts TO service_role;
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;
-- Owner OR admin can see the row exists, but tokens are never returned by app queries.
CREATE POLICY "gmail_accounts owner select" ON public.gmail_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) lead_emails: matched Gmail message metadata
CREATE TABLE public.lead_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  account_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_email text NOT NULL,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  snippet text,
  sent_at timestamptz NOT NULL,
  has_attachments boolean NOT NULL DEFAULT false,
  body_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, gmail_message_id)
);
CREATE INDEX idx_lead_emails_lead ON public.lead_emails(lead_id, sent_at DESC);
CREATE INDEX idx_lead_emails_thread ON public.lead_emails(lead_id, gmail_thread_id);
CREATE INDEX idx_lead_emails_account ON public.lead_emails(account_user_id);
GRANT SELECT ON public.lead_emails TO authenticated;
GRANT ALL ON public.lead_emails TO service_role;
ALTER TABLE public.lead_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_emails read" ON public.lead_emails FOR SELECT TO authenticated USING (
  account_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = lead_emails.lead_id AND l.assigned_to = auth.uid())
  OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin')
);

-- 4) gmail_sync_logs
CREATE TABLE public.gmail_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  new_emails int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  error_message text,
  scope text NOT NULL DEFAULT 'user' CHECK (scope IN ('user','lead','scheduled'))
);
CREATE INDEX idx_gmail_sync_logs_user ON public.gmail_sync_logs(user_id, started_at DESC);
GRANT SELECT ON public.gmail_sync_logs TO authenticated;
GRANT ALL ON public.gmail_sync_logs TO service_role;
ALTER TABLE public.gmail_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_sync_logs read" ON public.gmail_sync_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 5) gmail_notifications: in-app notifications for new matched inbound emails
CREATE TABLE public.gmail_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  count int NOT NULL DEFAULT 1,
  sample_from text,
  sample_subject text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gmail_notifications_user ON public.gmail_notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.gmail_notifications TO authenticated;
GRANT ALL ON public.gmail_notifications TO service_role;
ALTER TABLE public.gmail_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_notifications owner" ON public.gmail_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "gmail_notifications mark read" ON public.gmail_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6) lead_email_summaries: cached AI summaries per lead
CREATE TABLE public.lead_email_summaries (
  lead_id uuid PRIMARY KEY REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  summary_bullets text[] NOT NULL DEFAULT '{}',
  ball_in_court text,
  next_action text,
  based_on_message_ids text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_email_summaries TO authenticated;
GRANT ALL ON public.lead_email_summaries TO service_role;
ALTER TABLE public.lead_email_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_email_summaries read" ON public.lead_email_summaries FOR SELECT TO authenticated USING (true);
