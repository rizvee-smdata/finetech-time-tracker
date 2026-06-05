export type StopPriority = "high" | "medium" | "low";
export type VisitType = "discovery" | "follow_up" | "demo";
export type RoutePlanStatus = "draft" | "planned" | "in_progress" | "completed" | "cancelled";

export const VISIT_DURATIONS: Record<VisitType, number> = {
  discovery: 60,
  follow_up: 30,
  demo: 90,
};

export const PRIORITY_SCORE: Record<StopPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export const DHAKA_AREAS = [
  "Mirpur",
  "Uttara",
  "Gulshan",
  "Banani",
  "Baridhara",
  "Motijheel",
  "Paltan",
  "Farmgate",
  "Dhanmondi",
  "Mohammadpur",
  "Old Dhaka",
  "Tejgaon",
  "Bashundhara",
  "Khilkhet",
  "Mohakhali",
] as const;

export const DEFAULT_OFFICE = {
  lat: 23.7925, // Banani / Gulshan area — SmartData Limited HQ
  lng: 90.4078,
  label: "SmartData Office (Banani)",
};

export interface RouteStopCandidate {
  client_id: string; // local id (lead_id or generated)
  lead_id?: string | null;
  account_id?: string | null;
  client_name: string;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  priority: StopPriority;
  visit_type: VisitType;
  open_deal_value?: number | null;
  days_since_last_visit?: number | null;
}

export interface OptimizeResult {
  sequence: Array<{
    client_id: string;
    rationale: string;
    travel_time_from_prev_min: number;
    distance_from_prev_km: number;
    estimated_arrival_offset_min: number; // minutes after start
  }>;
  estimated_total_km: number;
  estimated_total_minutes: number;
  traffic_warnings: string[];
}

export interface RoutePlanRow {
  id: string;
  company_id: string;
  user_id: string;
  plan_date: string;
  status: RoutePlanStatus;
  title: string | null;
  notes: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  start_location: string | null;
  total_distance_km: number | null;
  total_minutes: number | null;
  estimated_return_time: string | null;
  traffic_warnings: string[];
  ai_model: string | null;
  optimized_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  actual_distance_km: number | null;
  mileage_expense_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteStopRow {
  id: string;
  plan_id: string;
  sequence: number;
  lead_id: string | null;
  account_id: string | null;
  customer_name: string;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  priority: StopPriority;
  visit_type: VisitType;
  planned_duration_minutes: number;
  travel_time_from_prev_min: number;
  distance_from_prev_km: number | null;
  estimated_arrival_time: string | null;
  rationale: string | null;
  open_deal_value: number | null;
  days_since_last_visit: number | null;
  checked_in: boolean;
  checked_in_at: string | null;
  checkin_id: string | null;
  task_id: string | null;
  status: "pending" | "arrived" | "completed" | "skipped";
}
