
-- 1. Soft delete columns
ALTER TABLE public.customers   ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.crm_leads   ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.crm_quotes  ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS customers_deleted_at_idx  ON public.customers(deleted_at);
CREATE INDEX IF NOT EXISTS crm_leads_deleted_at_idx  ON public.crm_leads(deleted_at);
CREATE INDEX IF NOT EXISTS crm_quotes_deleted_at_idx ON public.crm_quotes(deleted_at);

-- 2. Maintenance mode on companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false;

-- Guard: block writes to key tables when company is in maintenance, except admins
CREATE OR REPLACE FUNCTION public.guard_maintenance_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _mm boolean; _cid uuid;
BEGIN
  _cid := COALESCE(NEW.company_id, OLD.company_id);
  IF _cid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT maintenance_mode INTO _mm FROM public.companies WHERE id = _cid;
  IF COALESCE(_mm,false) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'System is in maintenance mode. Only admins can make changes.' USING ERRCODE='check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS guard_mm_customers ON public.customers;
CREATE TRIGGER guard_mm_customers BEFORE INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_mode();

DROP TRIGGER IF EXISTS guard_mm_crm_leads ON public.crm_leads;
CREATE TRIGGER guard_mm_crm_leads BEFORE INSERT OR UPDATE OR DELETE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_mode();

DROP TRIGGER IF EXISTS guard_mm_crm_quotes ON public.crm_quotes;
CREATE TRIGGER guard_mm_crm_quotes BEFORE INSERT OR UPDATE OR DELETE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_mode();

-- 3. Audit triggers (uses existing public.log_audit_event)
DROP TRIGGER IF EXISTS audit_customers ON public.customers;
CREATE TRIGGER audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('customer');

DROP TRIGGER IF EXISTS audit_crm_leads ON public.crm_leads;
CREATE TRIGGER audit_crm_leads AFTER INSERT OR UPDATE OR DELETE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('lead');

DROP TRIGGER IF EXISTS audit_crm_quotes ON public.crm_quotes;
CREATE TRIGGER audit_crm_quotes AFTER INSERT OR UPDATE OR DELETE ON public.crm_quotes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('quote');

-- 4. Normalize-on-write for customers
CREATE OR REPLACE FUNCTION public.normalize_customer()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN NEW.email := lower(btrim(NEW.email)); IF NEW.email='' THEN NEW.email := NULL; END IF; END IF;
  IF NEW.phone IS NOT NULL THEN NEW.phone := regexp_replace(btrim(NEW.phone), '[\s\-()]', '', 'g'); IF NEW.phone='' THEN NEW.phone := NULL; END IF; END IF;
  IF NEW.name  IS NOT NULL THEN NEW.name  := btrim(NEW.name); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS normalize_customers ON public.customers;
CREATE TRIGGER normalize_customers BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_customer();

-- 5. Soft-delete helpers (restore + purge old)
CREATE OR REPLACE FUNCTION public.purge_old_soft_deletes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.customers  WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.crm_leads  WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.crm_quotes WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '30 days';
END $$;
