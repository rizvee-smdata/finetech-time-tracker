export type PlanStatus = "draft" | "planned" | "in_progress" | "completed" | "cancelled";
export type StopStatus = "pending" | "arrived" | "completed" | "skipped";

export type RoutePlan = {
  id: string;
  company_id: string;
  user_id: string;
  plan_date: string;
  territory: string | null;
  title: string | null;
  notes: string | null;
  status: PlanStatus;
  created_by: string;
  start_location: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  created_at: string;
  updated_at: string;
};

export type RouteStop = {
  id: string;
  plan_id: string;
  sequence: number;
  lead_id: string | null;
  customer_name: string;
  location_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  planned_arrival: string | null;
  planned_duration_minutes: number | null;
  status: StopStatus;
  actual_visit_id: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export const PLAN_STATUS_META: Record<PlanStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-muted text-muted-foreground" },
  planned: { label: "Planned", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  in_progress: { label: "In progress", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  completed: { label: "Completed", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", tone: "bg-destructive/10 text-destructive" },
};

export const STOP_STATUS_META: Record<StopStatus, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-muted text-muted-foreground" },
  arrived: { label: "Arrived", tone: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  completed: { label: "Completed", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  skipped: { label: "Skipped", tone: "bg-destructive/10 text-destructive" },
};

export function mapsLink(lat?: number | null, lng?: number | null, address?: string | null) {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  return null;
}
