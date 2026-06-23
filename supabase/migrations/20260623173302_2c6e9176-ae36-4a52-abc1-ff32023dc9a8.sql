
-- ============ A) Schema additions ============

-- customers: tier enum + GPS/address/assignment/region
DO $$ BEGIN
  CREATE TYPE public.customer_tier AS ENUM ('strategic','standard','low_priority');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tier public.customer_tier NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS assigned_rep_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region text;

CREATE INDEX IF NOT EXISTS idx_customers_assigned_rep ON public.customers(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_customers_tier ON public.customers(tier);

-- profiles: reporting line manager
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON public.profiles(manager_id);

-- visit_checkins.account_id
ALTER TABLE public.visit_checkins
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_visit_checkins_account ON public.visit_checkins(account_id);

-- customer_visits.account_id
ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_visits_account ON public.customer_visits(account_id);

-- ============ C) Historical fuzzy match backfill ============
-- pg_trgm already enabled (per existing similarity() function)

-- Backfill visit_checkins.account_id from client_name within same company
WITH matches AS (
  SELECT v.id AS visit_id,
         (SELECT c.id
            FROM public.customers c
           WHERE c.company_id = v.company_id
             AND c.deleted_at IS NULL
             AND similarity(c.customer_name, v.client_name) >= 0.85
           ORDER BY similarity(c.customer_name, v.client_name) DESC
           LIMIT 1) AS account_id
    FROM public.visit_checkins v
   WHERE v.account_id IS NULL
     AND v.client_name IS NOT NULL
     AND length(btrim(v.client_name)) > 0
)
UPDATE public.visit_checkins v
   SET account_id = m.account_id
  FROM matches m
 WHERE v.id = m.visit_id AND m.account_id IS NOT NULL;

-- Backfill customer_visits.account_id from customer_name within same company
WITH matches AS (
  SELECT v.id AS visit_id,
         (SELECT c.id
            FROM public.customers c
           WHERE c.company_id = v.company_id
             AND c.deleted_at IS NULL
             AND similarity(c.customer_name, v.customer_name) >= 0.85
           ORDER BY similarity(c.customer_name, v.customer_name) DESC
           LIMIT 1) AS account_id
    FROM public.customer_visits v
   WHERE v.account_id IS NULL
     AND v.customer_name IS NOT NULL
     AND length(btrim(v.customer_name)) > 0
)
UPDATE public.customer_visits v
   SET account_id = m.account_id
  FROM matches m
 WHERE v.id = m.visit_id AND m.account_id IS NOT NULL;

-- ============ Admin views for review queue + summary ============
CREATE OR REPLACE VIEW public.visits_needing_account_review AS
SELECT
  'visit_checkin'::text AS source,
  v.id,
  v.company_id,
  v.user_id AS rep_id,
  p.full_name AS rep_name,
  v.client_name AS original_name,
  v.checkin_time AS visit_at
FROM public.visit_checkins v
LEFT JOIN public.profiles p ON p.id = v.user_id
WHERE v.account_id IS NULL
  AND v.client_name IS NOT NULL
  AND length(btrim(v.client_name)) > 0
UNION ALL
SELECT
  'customer_visit'::text AS source,
  v.id,
  v.company_id,
  v.user_id AS rep_id,
  p.full_name AS rep_name,
  v.customer_name AS original_name,
  v.meeting_at AS visit_at
FROM public.customer_visits v
LEFT JOIN public.profiles p ON p.id = v.user_id
WHERE v.account_id IS NULL
  AND v.customer_name IS NOT NULL
  AND length(btrim(v.customer_name)) > 0;

GRANT SELECT ON public.visits_needing_account_review TO authenticated;

CREATE OR REPLACE VIEW public.visit_account_migration_summary AS
SELECT
  company_id,
  SUM(total) AS total_rows,
  SUM(matched) AS auto_matched,
  SUM(needs_review) AS needs_review
FROM (
  SELECT company_id,
         COUNT(*) AS total,
         COUNT(account_id) AS matched,
         COUNT(*) FILTER (WHERE account_id IS NULL AND client_name IS NOT NULL AND length(btrim(client_name))>0) AS needs_review
    FROM public.visit_checkins GROUP BY company_id
  UNION ALL
  SELECT company_id,
         COUNT(*) AS total,
         COUNT(account_id) AS matched,
         COUNT(*) FILTER (WHERE account_id IS NULL AND customer_name IS NOT NULL AND length(btrim(customer_name))>0) AS needs_review
    FROM public.customer_visits GROUP BY company_id
) s
GROUP BY company_id;

GRANT SELECT ON public.visit_account_migration_summary TO authenticated;

-- ============ D) Manager team scoping helper ============
CREATE OR REPLACE FUNCTION public.reports_to_user(_manager uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT _manager = _user OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.manager_id = _manager
  );
$$;
