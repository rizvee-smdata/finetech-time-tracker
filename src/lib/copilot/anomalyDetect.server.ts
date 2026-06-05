// Server-only daily anomaly detector. Called by the cron route.

interface SbClient {
  from: (t: string) => any;
}

interface AnomalyInsert {
  company_id: string;
  kind: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  suggested_action: string;
  target_user_id?: string | null;
  target_lead_id?: string | null;
  metadata?: Record<string, unknown>;
  detected_for_date: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function detectAnomaliesForCompany(
  sb: SbClient,
  companyId: string,
): Promise<AnomalyInsert[]> {
  const now = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" }))
    .toISOString()
    .slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
  const fourteenDaysAgoIso = new Date(now.getTime() - 14 * MS_PER_DAY).toISOString();
  const twentyOneDaysAgoIso = new Date(now.getTime() - 21 * MS_PER_DAY).toISOString();
  const thirtyDaysAgoMs = now.getTime() - 30 * MS_PER_DAY;
  const sixtyDaysAgoMs = now.getTime() - 60 * MS_PER_DAY;
  const oneWeekAgoMs = now.getTime() - 7 * MS_PER_DAY;
  const twoWeeksAgoMs = now.getTime() - 14 * MS_PER_DAY;

  const out: AnomalyInsert[] = [];

  const [{ data: visits }, { data: leads }, { data: expenses }, { data: profiles }] = await Promise.all([
    sb
      .from("visit_checkins")
      .select("user_id, checkin_time, lead_id")
      .eq("company_id", companyId)
      .gte("checkin_time", new Date(twoWeeksAgoMs).toISOString()),
    sb
      .from("crm_leads")
      .select("id, customer_name, stage, expected_value, assigned_to, last_activity_at, account_id")
      .eq("company_id", companyId)
      .not("stage", "in", '("won","lost")')
      .limit(500),
    sb
      .from("expenses")
      .select("user_id, amount, expense_date")
      .eq("company_id", companyId)
      .gte("expense_date", new Date(now.getTime() - 120 * MS_PER_DAY).toISOString().slice(0, 10)),
    sb.from("profiles").select("id, full_name, email").limit(300),
  ]);

  const profilesById = new Map(((profiles ?? []) as Array<any>).map((p) => [p.id, p]));
  const nameOf = (uid: string) =>
    profilesById.get(uid)?.full_name || profilesById.get(uid)?.email || "Rep";

  // 1. Visit rate drop per rep
  const visitsPerRep = new Map<string, { last: number; prev: number }>();
  for (const v of (visits ?? []) as Array<any>) {
    const t = new Date(v.checkin_time).getTime();
    const cur = visitsPerRep.get(v.user_id) || { last: 0, prev: 0 };
    if (t >= oneWeekAgoMs) cur.last += 1;
    else if (t >= twoWeeksAgoMs) cur.prev += 1;
    visitsPerRep.set(v.user_id, cur);
  }
  for (const [userId, counts] of visitsPerRep.entries()) {
    if (counts.prev >= 3 && counts.last <= Math.floor(counts.prev * 0.6)) {
      const drop = Math.round(((counts.prev - counts.last) / counts.prev) * 100);
      out.push({
        company_id: companyId,
        kind: "visit_rate_drop",
        severity: drop >= 70 ? "high" : "medium",
        title: `${nameOf(userId)} visit rate dropped ${drop}%`,
        description: `${nameOf(userId)} logged ${counts.last} visits this week vs ${counts.prev} last week.`,
        suggested_action: "1:1 with the rep to identify blockers; review their planned route for this week.",
        target_user_id: userId,
        metadata: { last_week: counts.last, prev_week: counts.prev, drop_pct: drop },
        detected_for_date: today,
      });
    }
  }

  // 2. Stalled deals (no activity >14 days)
  for (const l of (leads ?? []) as Array<any>) {
    if (l.last_activity_at && l.last_activity_at < fourteenDaysAgoIso) {
      const days = Math.round((now.getTime() - new Date(l.last_activity_at).getTime()) / MS_PER_DAY);
      out.push({
        company_id: companyId,
        kind: "stalled_deal",
        severity: Number(l.expected_value || 0) > 1_000_000 ? "high" : "medium",
        title: `Deal ${l.customer_name} stalled (${days} days)`,
        description: `No activity logged for ${days} days. Stage: ${l.stage}, value ৳${Number(l.expected_value || 0).toLocaleString("en-IN")}.`,
        suggested_action: "Call the contact or schedule a visit; if no response in 7 days, mark at risk.",
        target_user_id: l.assigned_to,
        target_lead_id: l.id,
        metadata: { stage: l.stage, days_inactive: days, value: l.expected_value },
        detected_for_date: today,
      });
    }
  }

  // 3. Client with open deal not visited in >21 days
  const leadByAccount = new Map<string, Array<any>>();
  for (const l of (leads ?? []) as Array<any>) {
    const key = l.account_id || l.id;
    if (!leadByAccount.has(key)) leadByAccount.set(key, []);
    leadByAccount.get(key)!.push(l);
  }
  const visitsByLeadAccount = new Map<string, number>();
  for (const v of (visits ?? []) as Array<any>) {
    if (!v.lead_id) continue;
    const t = new Date(v.checkin_time).getTime();
    const prev = visitsByLeadAccount.get(v.lead_id) || 0;
    if (t > prev) visitsByLeadAccount.set(v.lead_id, t);
  }
  for (const [, accountLeads] of leadByAccount.entries()) {
    const mostRecent = accountLeads
      .map((l) => visitsByLeadAccount.get(l.id) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    if (mostRecent === 0 || mostRecent < new Date(twentyOneDaysAgoIso).getTime()) {
      const top = accountLeads.sort((a, b) => Number(b.expected_value || 0) - Number(a.expected_value || 0))[0];
      if (!top || Number(top.expected_value || 0) < 100_000) continue;
      out.push({
        company_id: companyId,
        kind: "client_not_visited",
        severity: "medium",
        title: `${top.customer_name} not visited in 21+ days`,
        description: `Open deal value ৳${Number(top.expected_value || 0).toLocaleString("en-IN")} with no recent on-site visit.`,
        suggested_action: "Schedule a check-in visit this week; bring fresh proposal or demo asset.",
        target_user_id: top.assigned_to,
        target_lead_id: top.id,
        metadata: { value: top.expected_value },
        detected_for_date: today,
      });
    }
  }

  // 4. Expense spike (last 7 days > 3x weekly average)
  const expensesPerRep = new Map<string, { weekly: number; monthly_avg_week: number }>();
  for (const e of (expenses ?? []) as Array<any>) {
    const t = new Date(e.expense_date).getTime();
    const cur = expensesPerRep.get(e.user_id) || { weekly: 0, monthly_avg_week: 0 };
    if (t >= oneWeekAgoMs) cur.weekly += Number(e.amount || 0);
    if (t >= thirtyDaysAgoMs && t < oneWeekAgoMs) cur.monthly_avg_week += Number(e.amount || 0);
    expensesPerRep.set(e.user_id, cur);
  }
  for (const [userId, v] of expensesPerRep.entries()) {
    const baseline = v.monthly_avg_week / 3; // avg per week of remaining 3 weeks
    if (baseline > 0 && v.weekly > baseline * 3 && v.weekly > 5000) {
      out.push({
        company_id: companyId,
        kind: "expense_spike",
        severity: "medium",
        title: `${nameOf(userId)} expense claims 3x average`,
        description: `This week: ৳${Math.round(v.weekly).toLocaleString("en-IN")} vs weekly avg ৳${Math.round(baseline).toLocaleString("en-IN")}.`,
        suggested_action: "Review submitted receipts before approval; ask for context if claims seem unusual.",
        target_user_id: userId,
        metadata: { weekly: v.weekly, baseline_weekly_avg: baseline },
        detected_for_date: today,
      });
    }
  }

  return out;
}

export async function persistAnomalies(sb: SbClient, anomalies: AnomalyInsert[]): Promise<number> {
  if (anomalies.length === 0) return 0;
  // Upsert via insert with on-conflict ignore (unique index handles dedupe)
  const { data, error } = await sb
    .from("copilot_anomalies")
    .upsert(anomalies, { onConflict: "company_id,kind,target_user_id,target_lead_id,detected_for_date", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("anomalies insert error", error);
    return 0;
  }
  return (data ?? []).length;
}
