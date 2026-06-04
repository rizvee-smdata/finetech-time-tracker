
CREATE TABLE public.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  company_name text,
  phone text,
  email text,
  last_contact_at timestamptz,
  last_interaction_type text,
  days_overdue integer NOT NULL DEFAULT 0,
  open_deal_value numeric(14,2),
  currency text NOT NULL DEFAULT 'BDT',
  priority_score integer NOT NULL DEFAULT 50,
  suggested_channel text NOT NULL DEFAULT 'whatsapp' CHECK (suggested_channel IN ('whatsapp','email')),
  ai_draft text,
  ai_draft_generated_at timestamptz,
  ai_subject text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','snoozed','dismissed','sent')),
  snoozed_until date,
  dismissed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX followups_company_status_idx ON public.followups (company_id, status, priority_score DESC);
CREATE INDEX followups_rep_idx ON public.followups (rep_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followups TO authenticated;
GRANT ALL ON public.followups TO service_role;

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "followups_select" ON public.followups FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR rep_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE POLICY "followups_insert" ON public.followups FOR INSERT TO authenticated
  WITH CHECK (is_company_member(auth.uid(), company_id)
    AND (rep_id = auth.uid() OR is_staff(auth.uid())));

CREATE POLICY "followups_update" ON public.followups FOR UPDATE TO authenticated
  USING (rep_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (rep_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE POLICY "followups_delete" ON public.followups FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR rep_id = auth.uid());

CREATE TRIGGER followups_touch BEFORE UPDATE ON public.followups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.followup_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  followup_id uuid REFERENCES public.followups(id) ON DELETE SET NULL,
  rep_id uuid NOT NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  company_name text,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  outcome text CHECK (outcome IN ('reply_received','meeting_booked','no_response','deal_progressed')),
  outcome_at timestamptz,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX followup_sends_company_idx ON public.followup_sends (company_id, sent_at DESC);
CREATE INDEX followup_sends_rep_idx ON public.followup_sends (rep_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_sends TO authenticated;
GRANT ALL ON public.followup_sends TO service_role;

ALTER TABLE public.followup_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "followup_sends_select" ON public.followup_sends FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR rep_id = auth.uid()
    OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE POLICY "followup_sends_insert" ON public.followup_sends FOR INSERT TO authenticated
  WITH CHECK (is_company_member(auth.uid(), company_id) AND rep_id = auth.uid());

CREATE POLICY "followup_sends_update" ON public.followup_sends FOR UPDATE TO authenticated
  USING (rep_id = auth.uid() OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())))
  WITH CHECK (rep_id = auth.uid() OR (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid())));

CREATE TRIGGER followup_sends_touch BEFORE UPDATE ON public.followup_sends
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.followup_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  inactivity_threshold_days integer NOT NULL DEFAULT 7,
  high_value_threshold numeric(14,2) NOT NULL DEFAULT 100000,
  high_value_boost integer NOT NULL DEFAULT 25,
  blackout_dates date[] NOT NULL DEFAULT '{}'::date[],
  industry_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_channel text NOT NULL DEFAULT 'whatsapp' CHECK (default_channel IN ('whatsapp','email')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_settings TO authenticated;
GRANT ALL ON public.followup_settings TO service_role;

ALTER TABLE public.followup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "followup_settings_select" ON public.followup_settings FOR SELECT TO authenticated
  USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "followup_settings_upsert" ON public.followup_settings FOR INSERT TO authenticated
  WITH CHECK (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()));

CREATE POLICY "followup_settings_update" ON public.followup_settings FOR UPDATE TO authenticated
  USING (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()))
  WITH CHECK (is_company_member(auth.uid(), company_id) AND is_staff(auth.uid()));

CREATE TRIGGER followup_settings_touch BEFORE UPDATE ON public.followup_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
