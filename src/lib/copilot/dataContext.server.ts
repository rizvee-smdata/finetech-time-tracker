// Server-only helper: aggregates a compact snapshot of company data for the Copilot.
// Imported only by .functions.ts / route handlers — never by components.

interface SbClient {
  from: (t: string) => any;
}

export interface CopilotDataSnapshot {
  generated_at: string;
  company_id: string;
  summary: Record<string, unknown>;
  rep_performance: Array<Record<string, unknown>>;
  pipeline_by_stage: Array<{ stage: string; count: number; value: number }>;
  recent_visits_by_area: Array<{ area: string; visits: number }>;
  open_deals: Array<Record<string, unknown>>;
  stalled_deals: Array<Record<string, unknown>>;
  client_health_risk: Array<Record<string, unknown>>;
  recent_expenses: Array<Record<string, unknown>>;
  product_performance: Array<{ product: string; deals: number; won_value: number }>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function buildCopilotDataSnapshot(
  sb: SbClient,
  companyId: string,
): Promise<CopilotDataSnapshot> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();

  const [
    { data: leads },
    { data: visits },
    { data: expenses },
    { data: profiles },
    { data: targets },
  ] = await Promise.all([
    sb
      .from("crm_leads")
      .select("id, customer_name, company_name, stage, expected_value, currency, assigned_to, last_activity_at, won_at, lost_at, created_at, account_id, lead_source, priority, stage_changed_at")
      .eq("company_id", companyId)
      .gte("created_at", new Date(now.getTime() - 365 * MS_PER_DAY).toISOString())
      .limit(500),
    sb
      .from("visit_checkins")
      .select("id, user_id, lead_id, checkin_time, address")
      .eq("company_id", companyId)
      .gte("checkin_time", ninetyDaysAgo)
      .limit(800),
    sb
      .from("expenses")
      .select("id, user_id, amount, currency, expense_date, category_name, status")
      .eq("company_id", companyId)
      .gte("expense_date", new Date(now.getTime() - 90 * MS_PER_DAY).toISOString().slice(0, 10))
      .limit(500),
    sb.from("profiles").select("id, full_name, email").limit(200),
    sb
      .from("sales_targets")
      .select("user_id, period_start, period_end, target_value, achieved_value")
      .eq("company_id", companyId)
      .gte("period_end", new Date(now.getTime() - 30 * MS_PER_DAY).toISOString().slice(0, 10))
      .limit(200)
      .then((r: any) => r, () => ({ data: [] })),
  ]);

  const leadList = (leads ?? []) as Array<any>;
  const visitList = (visits ?? []) as Array<any>;
  const expenseList = (expenses ?? []) as Array<any>;
  const profileList = (profiles ?? []) as Array<any>;
  const profilesById = new Map(profileList.map((p) => [p.id, p]));

  // Pipeline by stage
  const pipelineMap = new Map<string, { count: number; value: number }>();
  for (const l of leadList) {
    if (l.stage === "won" || l.stage === "lost") continue;
    const cur = pipelineMap.get(l.stage) || { count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(l.expected_value || 0);
    pipelineMap.set(l.stage, cur);
  }

  // Rep performance
  const repMap = new Map<string, {
    user_id: string;
    name: string;
    won_count: number;
    won_value: number;
    open_count: number;
    open_value: number;
    visits_last_30: number;
    visits_prev_30: number;
    last_activity: string | null;
  }>();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY).getTime();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_PER_DAY).getTime();
  for (const l of leadList) {
    if (!l.assigned_to) continue;
    const cur = repMap.get(l.assigned_to) || {
      user_id: l.assigned_to,
      name: profilesById.get(l.assigned_to)?.full_name || profilesById.get(l.assigned_to)?.email || "Unknown",
      won_count: 0,
      won_value: 0,
      open_count: 0,
      open_value: 0,
      visits_last_30: 0,
      visits_prev_30: 0,
      last_activity: null,
    };
    if (l.stage === "won" && l.won_at && new Date(l.won_at).toISOString() >= monthStart) {
      cur.won_count += 1;
      cur.won_value += Number(l.expected_value || 0);
    }
    if (l.stage !== "won" && l.stage !== "lost") {
      cur.open_count += 1;
      cur.open_value += Number(l.expected_value || 0);
    }
    if (l.last_activity_at && (!cur.last_activity || l.last_activity_at > cur.last_activity)) {
      cur.last_activity = l.last_activity_at;
    }
    repMap.set(l.assigned_to, cur);
  }
  for (const v of visitList) {
    const userId = v.user_id;
    if (!userId) continue;
    const cur = repMap.get(userId) || {
      user_id: userId,
      name: profilesById.get(userId)?.full_name || profilesById.get(userId)?.email || "Unknown",
      won_count: 0,
      won_value: 0,
      open_count: 0,
      open_value: 0,
      visits_last_30: 0,
      visits_prev_30: 0,
      last_activity: null,
    };
    const t = new Date(v.checkin_time).getTime();
    if (t >= thirtyDaysAgo) cur.visits_last_30 += 1;
    else if (t >= sixtyDaysAgo) cur.visits_prev_30 += 1;
    repMap.set(userId, cur);
  }

  // Visits by area
  const DHAKA_AREAS = ["Mirpur","Uttara","Gulshan","Banani","Baridhara","Motijheel","Paltan","Farmgate","Dhanmondi","Mohammadpur","Old Dhaka","Tejgaon","Bashundhara","Khilkhet","Mohakhali"];
  const areaCounts = new Map<string, number>();
  for (const v of visitList) {
    const text = (v.address || "").toString().toLowerCase();
    const matched = DHAKA_AREAS.find((a) => text.includes(a.toLowerCase())) || "Other";
    areaCounts.set(matched, (areaCounts.get(matched) || 0) + 1);
  }

  // Stalled deals
  const stalled = leadList
    .filter((l) => l.stage !== "won" && l.stage !== "lost" && l.last_activity_at && l.last_activity_at < fourteenDaysAgo)
    .slice(0, 25)
    .map((l) => ({
      id: l.id,
      customer: l.customer_name,
      stage: l.stage,
      value: Number(l.expected_value || 0),
      days_inactive: Math.round((now.getTime() - new Date(l.last_activity_at).getTime()) / MS_PER_DAY),
      owner: profilesById.get(l.assigned_to)?.full_name || "Unassigned",
    }));

  // Open deals (top by value)
  const openDeals = leadList
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .sort((a, b) => Number(b.expected_value || 0) - Number(a.expected_value || 0))
    .slice(0, 20)
    .map((l) => ({
      id: l.id,
      customer: l.customer_name,
      stage: l.stage,
      value: Number(l.expected_value || 0),
      owner: profilesById.get(l.assigned_to)?.full_name || "Unassigned",
      last_activity: l.last_activity_at,
    }));

  // Client health risk (last_activity over 21d for accounts with open deals)
  const accountActivity = new Map<string, { customer: string; last: string | null; open_value: number }>();
  for (const l of leadList) {
    if (l.stage === "won" || l.stage === "lost") continue;
    const key = l.account_id || l.id;
    const cur = accountActivity.get(key) || { customer: l.customer_name, last: l.last_activity_at, open_value: 0 };
    cur.open_value += Number(l.expected_value || 0);
    if (l.last_activity_at && (!cur.last || l.last_activity_at > cur.last)) cur.last = l.last_activity_at;
    accountActivity.set(key, cur);
  }
  const clientRisk = Array.from(accountActivity.values())
    .filter((a) => a.last && a.last < new Date(now.getTime() - 21 * MS_PER_DAY).toISOString())
    .sort((a, b) => b.open_value - a.open_value)
    .slice(0, 15)
    .map((a) => ({
      customer: a.customer,
      days_since_activity: a.last ? Math.round((now.getTime() - new Date(a.last).getTime()) / MS_PER_DAY) : null,
      open_value: a.open_value,
    }));

  // Expense totals (last 30 vs prev 30) per rep
  const expenseByRep = new Map<string, { last_30: number; prev_30: number }>();
  for (const e of expenseList) {
    const t = new Date(e.expense_date).getTime();
    const cur = expenseByRep.get(e.user_id) || { last_30: 0, prev_30: 0 };
    if (t >= thirtyDaysAgo) cur.last_30 += Number(e.amount || 0);
    else if (t >= sixtyDaysAgo) cur.prev_30 += Number(e.amount || 0);
    expenseByRep.set(e.user_id, cur);
  }
  const recentExpenses = Array.from(expenseByRep.entries())
    .map(([userId, v]) => ({
      rep: profilesById.get(userId)?.full_name || "Unknown",
      last_30_days: v.last_30,
      prev_30_days: v.prev_30,
    }))
    .sort((a, b) => b.last_30_days - a.last_30_days)
    .slice(0, 15);

  // Targets summary
  const targetSummary = ((targets ?? []) as Array<any>).slice(0, 50).map((t) => ({
    rep: profilesById.get(t.user_id)?.full_name || "Unknown",
    period: `${t.period_start} → ${t.period_end}`,
    target: Number(t.target_value || 0),
    achieved: Number(t.achieved_value || 0),
    attainment_pct: t.target_value ? Math.round((Number(t.achieved_value || 0) / Number(t.target_value)) * 100) : 0,
  }));

  // Simple totals
  const totalOpen = leadList.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const wonThisMonth = leadList.filter((l) => l.stage === "won" && l.won_at && l.won_at >= monthStart);
  const summary = {
    total_leads: leadList.length,
    open_leads_count: totalOpen.length,
    open_leads_value: totalOpen.reduce((s, l) => s + Number(l.expected_value || 0), 0),
    won_this_month_count: wonThisMonth.length,
    won_this_month_value: wonThisMonth.reduce((s, l) => s + Number(l.expected_value || 0), 0),
    visits_last_7d: visitList.filter((v) => new Date(v.checkin_time).toISOString() >= sevenDaysAgo).length,
    visits_last_30d: visitList.filter((v) => new Date(v.checkin_time).getTime() >= thirtyDaysAgo).length,
    rep_count: repMap.size,
    targets: targetSummary,
  };

  return {
    generated_at: now.toISOString(),
    company_id: companyId,
    summary,
    rep_performance: Array.from(repMap.values()),
    pipeline_by_stage: Array.from(pipelineMap.entries()).map(([stage, v]) => ({ stage, ...v })),
    recent_visits_by_area: Array.from(areaCounts.entries()).map(([area, visits]) => ({ area, visits })),
    open_deals: openDeals,
    stalled_deals: stalled,
    client_health_risk: clientRisk,
    recent_expenses: recentExpenses,
    product_performance: [], // products may not be tracked per deal; left for future
  };
}
