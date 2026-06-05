import { supabase } from "@/integrations/supabase/client";

export type RelationshipHealth = "warm" | "neutral" | "cold";

export interface MeetingBrief {
  snapshot_summary: string;
  open_items: string[];
  suggested_questions: string[];
  talking_points: Array<{ title: string; rationale: string }>;
  risk_flags: string[];
  relationship_health: RelationshipHealth;
  one_key_priority: string;
}

export interface MeetingPrepBriefRow {
  id: string;
  task_id: string;
  company_id: string;
  rep_id: string;
  lead_id: string | null;
  account_id: string | null;
  status: "pending" | "ready" | "failed";
  brief: MeetingBrief | null;
  aggregated_data: any;
  error: string | null;
  scheduled_at: string | null;
  generated_at: string | null;
  alerted_rep_at: string | null;
  prepared_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function generateMeetingPrep(taskId: string, force = false) {
  const { data, error } = await supabase.functions.invoke("generate-meeting-prep", {
    body: { task_id: taskId, force },
  });
  if (error) throw error;
  return data as { brief_id: string; brief: MeetingBrief; cached?: boolean };
}

export async function getBriefByTaskId(taskId: string) {
  const { data, error } = await supabase
    .from("meeting_prep_briefs")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as MeetingPrepBriefRow | null;
}

export async function listBriefsForUser(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from("meeting_prep_briefs")
    .select("*")
    .eq("rep_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MeetingPrepBriefRow[];
}

export async function markPrepared(briefId: string) {
  const { error } = await supabase
    .from("meeting_prep_briefs")
    .update({ prepared_at: new Date().toISOString() })
    .eq("id", briefId);
  if (error) throw error;
}

export function healthColor(h: RelationshipHealth | undefined | null): string {
  if (h === "warm") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (h === "cold") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

export function countdownString(scheduledAt?: string | null) {
  if (!scheduledAt) return null;
  const target = new Date(scheduledAt).getTime();
  const diffMin = Math.round((target - Date.now()) / 60000);
  if (diffMin > 90) {
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return `In ${h}h ${m}m`;
  }
  if (diffMin > 1) return `In ${diffMin} minutes`;
  if (diffMin >= -1) return `Starting now`;
  if (diffMin >= -60) return `${Math.abs(diffMin)} min ago`;
  return new Date(scheduledAt).toLocaleString();
}
