
ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_partner_id_fkey;
DROP TABLE IF EXISTS public.crm_partners CASCADE;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.customers(id) ON DELETE SET NULL;
