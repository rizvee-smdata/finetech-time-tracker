// Aggregate weekly metrics for narrative generation. Server-only.
import type { NarrativeMetrics } from "./types";

interface SbClient { from: (t: string) => any }

const MS = 86400000;

export async function aggregateWeeklyMetrics(
  sb: SbClient,
  companyId: string,
  weekStart: string,
  weekEnd: string,
): Promise<NarrativeMetrics> {
  const startIso = `${weekStart}T00:00:00.000Z`;
  const endIso = `${weekEnd}T23:59:59.999Z`;
  const monthAgoIso = new Date(new Date(weekStart).getTime() - 28 * MS).toISOString();

  const [
    { data: leads },
    { data: visits },
    { data: expenses },
    { data: attendance },
    { data: profiles },
    { data: targets },
    { data: surveys },
  ] = await Promise.all([
    sb.from("crm_leads")
      .select("id, customer_name, stage, expected_value, assigned_to, won_at, last_activity_at, created_at")
      .eq("company_id", companyId)
      .gte("created_at", monthAgoIso)
      .limit(1000),
    sb.from("visit_checkins")
      .select("id, user_id, checkin_time")
      .eq("company_id", companyId)
      .gte("checkin_time", monthAgoIso)
      .limit(1500),
    sb.from("expenses")
      .select("id, user_id, amount, expense_date, status")
      .eq("company_id", companyId)
      .gte("expense_date", new Date(new Date(weekStart).getTime() - 28 * MS).toISOString().slice(0, 10))
      .limit(800),
    sb.from("attendance_records")
      .select("id, user_id, status, work_date")
      .eq("company_id", companyId)
      .gte("work_date", weekStart).lte("work_date", weekEnd)
      .limit(800)
      .then((r: any) => r, () => ({ data: [] })),
    sb.from("profiles").select("id, full_name, email").limit(300),
    sb.from("sales_targets")
      .select("user_id, period_start, period_end, target_value")
      .eq("company_id", companyId)
      .lte("period_start", weekEnd).gte("period_end", weekStart)
      .limit(200)
      .then((r: any) => r, () => ({ data: [] })),
    sb.from("survey_responses")
      .select("nps_score, created_at")
      .eq("company_id", companyId)
      .gte("created_at", startIso).lte("created_at", endIso)
      .limit(500)
      .then((r: any) => r, () => ({ data: [] })),
  ]);

  const leadList = (leads ?? []) as any[];
  const visitList = (visits ?? []) as any[];
  const expenseList = (expenses ?? []) as any[];
  const attendanceList = (attendance ?? []) as any[];
  const profilesById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));

  const inRange = (iso: string | null) => !!iso && iso >= startIso && iso <= endIso;

  // Revenue closed this week
  const wonThisWeek = leadList.filter((l) => l.stage === "won" && inRange(l.won_at));
  const revenue_closed = wonThisWeek.reduce((s, l) => s + Number(l.expected_value || 0), 0);

  // Same week last month
  const lmStart = new Date(new Date(weekStart).getTime() - 28 * MS).toISOString();
  const lmEnd = new Date(new Date(weekEnd).getTime() - 28 * MS).toISOString();
  const wonLastMonth = leadList.filter(
    (l) => l.stage === "won" && l.won_at && l.won_at >= lmStart && l.won_at <= lmEnd,
  );
  const revenue_prev_period = wonLastMonth.reduce((s, l) => s + Number(l.expected_value || 0), 0);

  // Weekly target run rate
  const totalMonthlyTarget = ((targets ?? []) as any[]).reduce(
    (s, t) => s + Number(t.target_value || 0), 0,
  );
  const revenue_target = Math.round(totalMonthlyTarget / 4);

  // New deals
  const newDeals = leadList.filter((l) => inRange(l.created_at));
  const new_deals_count = newDeals.length;
  const new_deals_value = newDeals.reduce((s, l) => s + Number(l.expected_value || 0), 0);

  // Pipeline (open)
  const open = leadList.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const pipeline_value = open.reduce((s, l) => s + Number(l.expected_value || 0), 0);
  const stageMap = new Map<string, { count: number; value: number }>();
  for (const l of open) {
    const cur = stageMap.get(l.stage) || { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(l.expected_value || 0);
    stageMap.set(l.stage, cur);
  }
  const pipeline_by_stage = Array.from(stageMap.entries()).map(([stage, v]) => ({ stage, ...v }));

  // Visits
  const visitsThisWeek = visitList.filter((v) => inRange(v.checkin_time));
  const visits_done = visitsThisWeek.length;
  const visits_target = 5 * 6 * Math.max(1, new Set(visitList.map((v) => v.user_id)).size); // 5/day x 6 days x reps

  // Attendance
  const presentCount = attendanceList.filter((a) => a.status === "present" || a.status === "on_leave_approved").length;
  const attendance_rate = attendanceList.length
    ? Math.round((presentCount / attendanceList.length) * 100)
    : 0;

  // Top rep
  const repRevenue = new Map<string, number>();
  for (const l of wonThisWeek) {
    if (!l.assigned_to) continue;
    repRevenue.set(l.assigned_to, (repRevenue.get(l.assigned_to) || 0) + Number(l.expected_value || 0));
  }
  let top_rep: { name: string; revenue: number } | null = null;
  for (const [uid, rev] of repRevenue) {
    if (!top_rep || rev > top_rep.revenue) {
      top_rep = { name: profilesById.get(uid)?.full_name || "Unknown", revenue: rev };
    }
  }

  // Rep breakdown
  const repAgg = new Map<string, { name: string; revenue: number; visits: number; deals: number }>();
  for (const l of wonThisWeek) {
    if (!l.assigned_to) continue;
    const e = repAgg.get(l.assigned_to) || { name: profilesById.get(l.assigned_to)?.full_name || "Unknown", revenue: 0, visits: 0, deals: 0 };
    e.revenue += Number(l.expected_value || 0);
    e.deals += 1;
    repAgg.set(l.assigned_to, e);
  }
  for (const v of visitsThisWeek) {
    if (!v.user_id) continue;
    const e = repAgg.get(v.user_id) || { name: profilesById.get(v.user_id)?.full_name || "Unknown", revenue: 0, visits: 0, deals: 0 };
    e.visits += 1;
    repAgg.set(v.user_id, e);
  }
  const rep_breakdown = Array.from(repAgg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // At-risk clients (deals open and inactive > 21d)
  const cutoff = new Date(new Date(weekEnd).getTime() - 21 * MS).toISOString();
  const at_risk_clients = open.filter((l) => l.last_activity_at && l.last_activity_at < cutoff).length;

  // NPS
  const npsList = ((surveys ?? []) as any[]).map((s) => Number(s.nps_score)).filter((n) => isFinite(n));
  const nps_avg = npsList.length ? Math.round((npsList.reduce((a, b) => a + b, 0) / npsList.length) * 10) / 10 : null;

  // Expenses
  const expensesThisWeek = expenseList.filter((e) => e.expense_date >= weekStart && e.expense_date <= weekEnd);
  const expenses_total = expensesThisWeek.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenses_budget = Math.round(revenue_target * 0.15);

  // Revenue trend (last 4 weeks)
  const revenue_trend: Array<{ week: string; revenue: number }> = [];
  for (let i = 3; i >= 0; i--) {
    const wStart = new Date(new Date(weekStart).getTime() - i * 7 * MS).toISOString();
    const wEnd = new Date(new Date(weekEnd).getTime() - i * 7 * MS).toISOString();
    const wRev = leadList
      .filter((l) => l.stage === "won" && l.won_at && l.won_at >= wStart && l.won_at <= wEnd)
      .reduce((s, l) => s + Number(l.expected_value || 0), 0);
    revenue_trend.push({ week: wStart.slice(5, 10), revenue: wRev });
  }

  return {
    revenue_closed,
    revenue_prev_period,
    revenue_target,
    new_deals_count,
    new_deals_value,
    pipeline_value,
    pipeline_by_stage,
    visits_done,
    visits_target,
    attendance_rate,
    top_rep,
    at_risk_clients,
    nps_avg,
    expenses_total,
    expenses_budget,
    rep_breakdown,
    revenue_trend,
  };
}
