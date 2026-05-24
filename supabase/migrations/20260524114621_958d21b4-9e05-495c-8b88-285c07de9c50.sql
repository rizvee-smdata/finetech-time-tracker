
-- 1) Quote accepted → auto-move lead to Won
CREATE OR REPLACE FUNCTION public.crm_handle_quote_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' AND OLD.status = 'draft' THEN
      NEW.sent_at := COALESCE(NEW.sent_at, now());
      UPDATE public.crm_leads SET stage = 'negotiation', last_activity_at = now()
        WHERE id = NEW.lead_id AND stage IN ('new','initial_contact','pricing');
    END IF;
    IF NEW.status = 'accepted' THEN
      NEW.decided_at := COALESCE(NEW.decided_at, now());
      UPDATE public.crm_leads
        SET stage = 'won', last_activity_at = now()
        WHERE id = NEW.lead_id AND stage NOT IN ('won','lost');
    ELSIF NEW.status = 'rejected' THEN
      NEW.decided_at := COALESCE(NEW.decided_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 2) Manager/admin notification when lead moves to closure / won / lost
CREATE OR REPLACE FUNCTION public.crm_notify_managers_on_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage
     AND NEW.stage IN ('closure','won','lost') THEN
    _title := 'Lead ' || NEW.customer_name || ' moved to ' || NEW.stage;

    -- notify all admins + managers (staff) who are members of the same company
    FOR _user_id IN
      SELECT DISTINCT cm.user_id
      FROM public.company_members cm
      JOIN public.user_roles ur ON ur.user_id = cm.user_id
      WHERE cm.company_id = NEW.company_id
        AND ur.role IN ('admin','manager')
    LOOP
      INSERT INTO public.reminders (user_id, company_id, title, body, remind_at)
      VALUES (_user_id, NEW.company_id, _title,
        'Expected value: ' || COALESCE(NEW.expected_value::text, '—') || ' ' || NEW.currency,
        now());
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS crm_leads_notify_milestone ON public.crm_leads;
CREATE TRIGGER crm_leads_notify_milestone
  AFTER UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_notify_managers_on_milestone();

-- Ensure existing triggers from the original migration are wired (idempotent)
DROP TRIGGER IF EXISTS crm_leads_change ON public.crm_leads;
CREATE TRIGGER crm_leads_change
  BEFORE INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_lead_change();

DROP TRIGGER IF EXISTS crm_leads_log ON public.crm_leads;
CREATE TRIGGER crm_leads_log
  AFTER INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_lead_change();

DROP TRIGGER IF EXISTS crm_quotes_change ON public.crm_quotes;
CREATE TRIGGER crm_quotes_change
  BEFORE UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.crm_handle_quote_change();

DROP TRIGGER IF EXISTS crm_quotes_log ON public.crm_quotes;
CREATE TRIGGER crm_quotes_log
  AFTER INSERT OR UPDATE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.crm_log_quote();

DROP TRIGGER IF EXISTS crm_activities_touch ON public.crm_lead_activities;
CREATE TRIGGER crm_activities_touch
  AFTER INSERT ON public.crm_lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_lead_activity();

-- 3) Idle-lead reminder (daily cron) — no activity for 5+ days in active stages
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.crm_remind_idle_leads()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.reminders (user_id, company_id, title, body, remind_at)
  SELECT
    l.assigned_to,
    l.company_id,
    'Idle lead: ' || l.customer_name,
    'No activity in ' || EXTRACT(DAY FROM (now() - l.last_activity_at))::int || ' days. Stage: ' || l.stage,
    now()
  FROM public.crm_leads l
  WHERE l.assigned_to IS NOT NULL
    AND l.stage IN ('new','initial_contact','pricing','negotiation','closure')
    AND l.last_activity_at < now() - INTERVAL '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.reminders r
      WHERE r.user_id = l.assigned_to
        AND r.title = 'Idle lead: ' || l.customer_name
        AND r.created_at > now() - INTERVAL '3 days'
    );
END $function$;

SELECT cron.unschedule('crm-idle-leads') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-idle-leads');
SELECT cron.schedule('crm-idle-leads', '0 9 * * *', $$SELECT public.crm_remind_idle_leads();$$);
