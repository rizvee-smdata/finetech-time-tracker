
-- Extend target metric enum
ALTER TYPE public.target_metric ADD VALUE IF NOT EXISTS 'calls';
ALTER TYPE public.target_metric ADD VALUE IF NOT EXISTS 'demos';
ALTER TYPE public.target_metric ADD VALUE IF NOT EXISTS 'proposals';
ALTER TYPE public.crm_activity_type ADD VALUE IF NOT EXISTS 'demo';
