import { supabase } from "@/integrations/supabase/client";

export interface PredictionInputs {
  rep_id: string;
  rep_name: string;
  target_value: number;
  achieved_so_far: number;
  open_pipeline_weighted: number;
  days_elapsed: number;
  total_working_days: number;
  ratio_elapsed: number;
  historical_close_rate_per_day: number;
  visits_this_month: number;
  historical_visits_per_day: number;
  open_deals_count: number;
  avg_deal_size: number;
}

export interface PredictionRun {
  id: string;
  company_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  run_date: string;
  inputs: PredictionInputs;
  predicted_revenue: number;
  best_case: number;
  worst_case: number;
  confidence: number;
  gap_to_target: number;
  required_additional_visits: number;
  required_additional_proposals: number;
  key_driver: string | null;
  risk_factor: string | null;
  recommendation: string | null;
  target_value: number;
  achieved_value: number;
  achievement_pct: number;
  model: string | null;
  generated_at: string;
}

const sb = supabase as unknown as { from: (t: string) => any; functions: { invoke: (n: string, opts: any) => any } };

export async function generatePrediction(companyId: string, repId?: string, force = false) {
  const { data, error } = await sb.functions.invoke("generate-prediction", {
    body: { company_id: companyId, rep_id: repId, force },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).prediction as PredictionRun;
}

export async function getLatestPrediction(userId: string): Promise<PredictionRun | null> {
  const { data } = await sb
    .from("prediction_runs")
    .select("*")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PredictionRun | null) ?? null;
}

export async function getPredictionHistory(userId: string, limit = 60): Promise<PredictionRun[]> {
  const { data } = await sb
    .from("prediction_runs")
    .select("*")
    .eq("user_id", userId)
    .order("run_date", { ascending: false })
    .limit(limit);
  return (data as PredictionRun[]) ?? [];
}

export async function getTeamLatestPredictions(companyId: string): Promise<PredictionRun[]> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const { data } = await sb
    .from("prediction_runs")
    .select("*")
    .eq("company_id", companyId)
    .gte("period_start", monthStart)
    .order("generated_at", { ascending: false });
  // Dedupe to latest per user
  const seen = new Set<string>();
  const result: PredictionRun[] = [];
  for (const row of (data as PredictionRun[]) ?? []) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    result.push(row);
  }
  return result;
}

export function fmtBdt(n: number) {
  return "৳" + Math.round(n).toLocaleString("en-IN");
}

export function riskBand(pct: number): "on_track" | "at_risk" | "critical" {
  if (pct >= 90) return "on_track";
  if (pct >= 70) return "at_risk";
  return "critical";
}

/** Client-side simulator: estimate revised prediction if `extraRevenue` closes now. */
export function simulateClose(p: PredictionRun, extraRevenue: number) {
  const predicted = Number(p.predicted_revenue) + extraRevenue;
  const best = Number(p.best_case) + extraRevenue;
  const worst = Number(p.worst_case) + extraRevenue;
  const gap = Number(p.target_value) - predicted;
  const pct = p.target_value > 0 ? Math.round((predicted / p.target_value) * 100) : 0;
  return { predicted_revenue: predicted, best_case: best, worst_case: worst, gap_to_target: gap, achievement_pct: pct };
}
