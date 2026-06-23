import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TodayPlanItem = {
  account_id: string | null;
  lead_id: string | null;
  customer_name: string;
  reason: string;
  priority: "high" | "medium" | "low";
  expected_value: number;
  last_visit_days: number | null;
  city: string | null;
};

export type TodayPlan = {
  scheduled: TodayPlanItem[];
  recommended: TodayPlanItem[];
  follow_ups: TodayPlanItem[];
  summary: { total: number; pipeline_value: number };
};

/** Today's field plan — combines scheduled meetings, AI-recommended targets, and pending follow-ups. */
export const getTodayPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<TodayPlan> => {
    const { supabase, userId } = context;
    const repId = data.repId ?? userId;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    // Scheduled: meetings logged for today (or future planned today)
    const { data: visits } = await supabase
      .from("customer_visits")
      .select("id, customer_name, lead_id, meeting_at, location, next_action")
      .eq("user_id", repId)
      .gte("meeting_at", todayStart.toISOString())
      .lte("meeting_at", todayEnd.toISOString())
      .limit(20);

    const scheduled: TodayPlanItem[] = (visits ?? []).map((v: any) => ({
      account_id: null,
      lead_id: v.lead_id,
      customer_name: v.customer_name,
      reason: "Scheduled today",
      priority: "high" as const,
      expected_value: 0,
      last_visit_days: 0,
      city: v.location ?? null,
    }));

    // Recommended: top stale high-value accounts assigned to rep
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, customer_name, expected_value, last_activity_at, account_id, stage")
      .eq("assigned_to", repId)
      .not("stage", "in", "(won,lost)")
      .order("expected_value", { ascending: false })
      .limit(50);

    const recommended: TodayPlanItem[] = [];
    for (const l of (leads ?? []) as any[]) {
      const days = l.last_activity_at
        ? Math.floor((Date.now() - new Date(l.last_activity_at).getTime()) / 86400000)
        : 999;
      if (days < 7) continue;
      recommended.push({
        account_id: l.account_id,
        lead_id: l.id,
        customer_name: l.customer_name,
        reason: days > 30 ? `Stale ${days}d • high value` : `${days}d since touch`,
        priority: l.expected_value > 100000 ? "high" : days > 30 ? "high" : "medium",
        expected_value: Number(l.expected_value ?? 0),
        last_visit_days: days,
        city: null,
      });
      if (recommended.length >= 8) break;
    }

    // Follow-ups: open next_actions from recent visits
    const { data: pending } = await supabase
      .from("customer_visits")
      .select("id, customer_name, lead_id, next_action, meeting_at, location")
      .eq("user_id", repId)
      .not("next_action", "is", null)
      .lt("meeting_at", todayStart.toISOString())
      .gte("meeting_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("meeting_at", { ascending: false })
      .limit(10);

    const follow_ups: TodayPlanItem[] = (pending ?? [])
      .filter((p: any) => p.next_action?.trim())
      .map((p: any) => ({
        account_id: null,
        lead_id: p.lead_id,
        customer_name: p.customer_name,
        reason: p.next_action.slice(0, 80),
        priority: "medium" as const,
        expected_value: 0,
        last_visit_days: Math.floor((Date.now() - new Date(p.meeting_at).getTime()) / 86400000),
        city: p.location ?? null,
      }));

    const pipeline_value =
      scheduled.reduce((s, i) => s + i.expected_value, 0) +
      recommended.reduce((s, i) => s + i.expected_value, 0);

    return {
      scheduled,
      recommended,
      follow_ups,
      summary: { total: scheduled.length + recommended.length + follow_ups.length, pipeline_value },
    };
  });

export type HeatmapCell = {
  city: string;
  visits: number;
  unique_accounts: number;
  last_visit_days: number | null;
  status: "hot" | "warm" | "cold";
};

/** Coverage heatmap by city — last 30 days of visits aggregated geographically. */
export const getVisitHeatmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<{ cells: HeatmapCell[] }> => {
    const { supabase } = context;
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: visits } = await supabase
      .from("customer_visits")
      .select("location, customer_name, meeting_at")
      .gte("meeting_at", since)
      .not("location", "is", null)
      .limit(2000);

    const cityMap = new Map<string, { visits: number; accounts: Set<string>; last: number }>();
    for (const v of (visits ?? []) as any[]) {
      const city = (v.location as string).split(",")[0]?.trim() || "Unknown";
      if (!cityMap.has(city)) cityMap.set(city, { visits: 0, accounts: new Set(), last: 0 });
      const cell = cityMap.get(city)!;
      cell.visits++;
      cell.accounts.add(v.customer_name);
      const ts = new Date(v.meeting_at).getTime();
      if (ts > cell.last) cell.last = ts;
    }

    const cells: HeatmapCell[] = Array.from(cityMap.entries())
      .map(([city, c]) => {
        const lastDays = c.last ? Math.floor((Date.now() - c.last) / 86400000) : null;
        const status: "hot" | "warm" | "cold" =
          c.visits >= 10 ? "hot" : c.visits >= 3 ? "warm" : "cold";
        return {
          city,
          visits: c.visits,
          unique_accounts: c.accounts.size,
          last_visit_days: lastDays,
          status,
        };
      })
      .sort((a, b) => b.visits - a.visits);

    return { cells };
  });
