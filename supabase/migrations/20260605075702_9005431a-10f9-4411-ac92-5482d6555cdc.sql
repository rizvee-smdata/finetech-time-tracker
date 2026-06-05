
ALTER TABLE public.route_plans
  ADD COLUMN IF NOT EXISTS total_distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_minutes integer,
  ADD COLUMN IF NOT EXISTS estimated_return_time timestamptz,
  ADD COLUMN IF NOT EXISTS traffic_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS optimized_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS mileage_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

ALTER TABLE public.route_plan_stops
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'follow_up',
  ADD COLUMN IF NOT EXISTS travel_time_from_prev_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_from_prev_km numeric(8,2),
  ADD COLUMN IF NOT EXISTS estimated_arrival_time timestamptz,
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS open_deal_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS days_since_last_visit integer,
  ADD COLUMN IF NOT EXISTS checked_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_id uuid REFERENCES public.visit_checkins(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tms_tasks(id) ON DELETE SET NULL;
