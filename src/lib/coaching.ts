import { supabase } from "@/integrations/supabase/client";

export type CoachingInsight = {
  id: string;
  company_id: string;
  user_id: string;
  week_start: string;
  strength: string | null;
  focus_area: string | null;
  win_pattern: string | null;
  actions: string[];
  engagement_score: number | null;
  motivational_message: string | null;
  evidence: Record<string, any>;
  data_snapshot: Record<string, any>;
  model: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
};

export function weekOfLabel(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ragForScore(s: number | null | undefined) {
  if (s == null) return "muted";
  if (s >= 8) return "green";
  if (s >= 5) return "amber";
  return "red";
}

export async function generateInsights(repId?: string, companyId?: string, force = false) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "ejiaxmvzolqgfcawgyvl";
  const url = `https://${projectId}.functions.supabase.co/generate-coaching-insights`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rep_id: repId, company_id: companyId, force }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data.insight as CoachingInsight;
}

export async function flagRepForCoaching(args: {
  companyId: string;
  repId: string;
  reason?: string;
  scheduledAt?: string | null;
  insightId?: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const me = userData.user?.id;
  if (!me) throw new Error("Not authenticated");

  // create reminder
  await supabase.from("reminders").insert({
    user_id: me,
    company_id: args.companyId,
    title: `1:1 coaching with rep`,
    body: args.reason ?? "Scheduled from AI Sales Coach",
    remind_at: args.scheduledAt ?? new Date().toISOString(),
  });

  // create task
  const { data: task } = await supabase
    .from("tms_tasks")
    .insert({
      company_id: args.companyId,
      title: `1:1 coaching session`,
      description: args.reason ?? "Flagged from AI Sales Coach for follow-up.",
      created_by: me,
      due_date: (args.scheduledAt ?? new Date().toISOString()).slice(0, 10),
      category: "coaching",
    } as any)
    .select("id")
    .single();

  const { data: flag, error } = await supabase
    .from("coaching_flags")
    .insert({
      company_id: args.companyId,
      rep_id: args.repId,
      flagged_by: me,
      reason: args.reason ?? null,
      scheduled_at: args.scheduledAt ?? null,
      insight_id: args.insightId ?? null,
      task_id: task?.id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return flag;
}
