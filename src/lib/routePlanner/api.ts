import { supabase } from "@/integrations/supabase/client";
import type { RoutePlanRow, RouteStopRow, StopPriority, VisitType } from "./types";
import { haversineKm } from "./utils";

const sb = supabase as unknown as { from: (t: string) => any };

export async function getTodayPlan(userId: string, dateIso: string): Promise<RoutePlanRow | null> {
  const { data } = await sb
    .from("route_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_date", dateIso)
    .maybeSingle();
  return (data as RoutePlanRow | null) ?? null;
}

export async function getPlanStops(planId: string): Promise<RouteStopRow[]> {
  const { data } = await sb
    .from("route_plan_stops")
    .select("*")
    .eq("plan_id", planId)
    .order("sequence", { ascending: true });
  return (data as RouteStopRow[]) ?? [];
}

export interface CreatePlanInput {
  company_id: string;
  user_id: string;
  plan_date: string;
  start_lat: number;
  start_lng: number;
  start_location: string;
}

export async function ensurePlan(input: CreatePlanInput): Promise<RoutePlanRow> {
  const existing = await getTodayPlan(input.user_id, input.plan_date);
  if (existing) return existing;
  const { data, error } = await sb
    .from("route_plans")
    .insert({
      company_id: input.company_id,
      user_id: input.user_id,
      created_by: input.user_id,
      plan_date: input.plan_date,
      start_latitude: input.start_lat,
      start_longitude: input.start_lng,
      start_location: input.start_location,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RoutePlanRow;
}

export interface StopUpsert {
  sequence: number;
  lead_id?: string | null;
  account_id?: string | null;
  customer_name: string;
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priority: StopPriority;
  visit_type: VisitType;
  planned_duration_minutes: number;
  travel_time_from_prev_min: number;
  distance_from_prev_km?: number | null;
  estimated_arrival_time?: string | null;
  rationale?: string | null;
  open_deal_value?: number | null;
  days_since_last_visit?: number | null;
}

export async function replaceStops(planId: string, stops: StopUpsert[]): Promise<void> {
  // Delete existing then insert new (simpler than diffing for a small list)
  await sb.from("route_plan_stops").delete().eq("plan_id", planId);
  if (stops.length === 0) return;
  const rows = stops.map((s) => ({ ...s, plan_id: planId, status: "pending" }));
  const { error } = await sb.from("route_plan_stops").insert(rows);
  if (error) throw error;
}

export async function updatePlan(planId: string, patch: Partial<RoutePlanRow>): Promise<void> {
  const { error } = await sb.from("route_plans").update(patch).eq("id", planId);
  if (error) throw error;
}

export async function markStopCheckedIn(stopId: string, checkinId?: string): Promise<void> {
  await sb
    .from("route_plan_stops")
    .update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
      status: "completed",
      checkin_id: checkinId ?? null,
    })
    .eq("id", stopId);
}

export async function confirmPlanAndMaterializeTasks(
  plan: RoutePlanRow,
  stops: RouteStopRow[],
): Promise<void> {
  // Update plan
  await updatePlan(plan.id, {
    status: "planned",
    confirmed_at: new Date().toISOString(),
  } as any);

  // Find Client Visit category label not strictly required; create tms_tasks with task_type='task'
  for (const s of stops) {
    if (s.task_id) continue;
    const { data: task, error } = await sb
      .from("tms_tasks")
      .insert({
        company_id: plan.company_id,
        title: `Visit: ${s.customer_name}`,
        description: s.rationale || `Stop ${s.sequence} on today's route — ${s.area ?? ""}`.trim(),
        task_type: "task",
        priority: s.priority === "high" ? "high" : s.priority === "low" ? "low" : "medium",
        due_date: plan.plan_date,
        scheduled_time: s.estimated_arrival_time,
        category: "Client Visit",
        created_by: plan.user_id,
        lead_id: s.lead_id,
      } as any)
      .select("id")
      .single();
    if (!error && task) {
      await sb
        .from("tms_task_assignees")
        .insert({ task_id: (task as any).id, user_id: plan.user_id });
      await sb.from("route_plan_stops").update({ task_id: (task as any).id }).eq("id", s.id);
    }
  }
}

/**
 * Compute actual km from check-in points + create mileage expense.
 * Idempotent: only inserts if mileage_expense_id is null.
 */
export async function finalizeMileage(
  plan: RoutePlanRow,
  start: { lat: number; lng: number },
): Promise<{ km: number; expenseId: string | null }> {
  if (plan.mileage_expense_id) {
    return { km: plan.actual_distance_km ?? 0, expenseId: plan.mileage_expense_id };
  }
  const { data: checkins } = await sb
    .from("route_plan_stops")
    .select("checked_in, checked_in_at, checkin_id, latitude, longitude")
    .eq("plan_id", plan.id)
    .eq("checked_in", true)
    .order("sequence", { ascending: true });

  const points: { lat: number; lng: number }[] = [start];
  for (const c of (checkins ?? []) as any[]) {
    if (c.checkin_id) {
      const { data: vc } = await sb
        .from("visit_checkins")
        .select("checkin_lat, checkin_lng")
        .eq("id", c.checkin_id)
        .maybeSingle();
      if (vc && (vc as any).checkin_lat != null) {
        points.push({ lat: (vc as any).checkin_lat, lng: (vc as any).checkin_lng });
        continue;
      }
    }
    if (c.latitude != null && c.longitude != null) {
      points.push({ lat: c.latitude, lng: c.longitude });
    }
  }
  points.push(start); // return trip

  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);

  // Standard BDT 15/km mileage rate (typical Dhaka rate)
  const rate = 15;
  const amount = Math.round(km * rate);

  const { data: exp, error } = await sb
    .from("expenses")
    .insert({
      company_id: plan.company_id,
      user_id: plan.user_id,
      category_name: "Mileage",
      amount,
      currency: "BDT",
      expense_date: plan.plan_date,
      description: `Auto: route mileage ${km.toFixed(1)} km × ৳${rate}/km`,
      status: "draft",
    } as any)
    .select("id")
    .single();
  if (error) {
    console.error("mileage expense insert failed", error);
    return { km, expenseId: null };
  }
  const expenseId = (exp as any).id as string;
  await updatePlan(plan.id, {
    actual_distance_km: Number(km.toFixed(2)),
    mileage_expense_id: expenseId,
    status: "completed",
    completed_at: new Date().toISOString(),
  } as any);
  return { km, expenseId };
}

export async function getTeamRoutesForDate(companyId: string, dateIso: string) {
  const { data: plans } = await sb
    .from("route_plans")
    .select("*")
    .eq("company_id", companyId)
    .eq("plan_date", dateIso);
  const planList = (plans as RoutePlanRow[]) ?? [];
  const planIds = planList.map((p) => p.id);
  if (planIds.length === 0) return { plans: planList, stopsByPlan: {} as Record<string, RouteStopRow[]> };

  const { data: stops } = await sb
    .from("route_plan_stops")
    .select("*")
    .in("plan_id", planIds)
    .order("sequence", { ascending: true });
  const stopsByPlan: Record<string, RouteStopRow[]> = {};
  for (const s of (stops as RouteStopRow[]) ?? []) {
    (stopsByPlan[s.plan_id] ||= []).push(s);
  }
  return { plans: planList, stopsByPlan };
}
