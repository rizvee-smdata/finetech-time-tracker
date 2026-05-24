
CREATE TYPE public.route_plan_status AS ENUM ('draft','planned','in_progress','completed','cancelled');
CREATE TYPE public.route_stop_status AS ENUM ('pending','arrived','completed','skipped');

CREATE TABLE public.route_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  plan_date DATE NOT NULL,
  territory TEXT,
  title TEXT,
  notes TEXT,
  status public.route_plan_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  start_location TEXT,
  start_latitude DOUBLE PRECISION,
  start_longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX route_plans_user_date_idx ON public.route_plans(user_id, plan_date);
CREATE INDEX route_plans_company_date_idx ON public.route_plans(company_id, plan_date);

CREATE TABLE public.route_plan_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.route_plans(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 0,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  location_name TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  planned_arrival TIME,
  planned_duration_minutes INTEGER DEFAULT 30,
  status public.route_stop_status NOT NULL DEFAULT 'pending',
  actual_visit_id UUID REFERENCES public.customer_visits(id) ON DELETE SET NULL,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX route_plan_stops_plan_idx ON public.route_plan_stops(plan_id, sequence);

ALTER TABLE public.route_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_plan_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view plans" ON public.route_plans FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
);
CREATE POLICY "insert plans" ON public.route_plans FOR INSERT
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (user_id = auth.uid() OR public.is_staff(auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role))
);
CREATE POLICY "update plans" ON public.route_plans FOR UPDATE
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), company_id) AND public.is_staff(auth.uid()))
);
CREATE POLICY "delete plans" ON public.route_plans FOR DELETE
USING (
  user_id = auth.uid()
  OR (public.has_role(auth.uid(),'admin'::app_role) AND public.is_company_member(auth.uid(), company_id))
);

CREATE POLICY "view stops" ON public.route_plan_stops FOR SELECT
USING (EXISTS (SELECT 1 FROM public.route_plans p WHERE p.id = plan_id AND (
  p.user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), p.company_id) AND public.is_staff(auth.uid()))
)));
CREATE POLICY "manage stops" ON public.route_plan_stops FOR ALL
USING (EXISTS (SELECT 1 FROM public.route_plans p WHERE p.id = plan_id AND (
  p.user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), p.company_id) AND public.is_staff(auth.uid()))
)))
WITH CHECK (EXISTS (SELECT 1 FROM public.route_plans p WHERE p.id = plan_id AND (
  p.user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin'::app_role)
  OR (public.is_company_member(auth.uid(), p.company_id) AND public.is_staff(auth.uid()))
)));

CREATE TRIGGER set_route_plans_updated_at
BEFORE UPDATE ON public.route_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
