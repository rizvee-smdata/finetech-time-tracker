ALTER TABLE public.tms_tasks
  ADD CONSTRAINT tms_tasks_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE SET NULL;