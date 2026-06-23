import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SmartPlanStop = {
  account_id: string;
  account_name: string;
  reason: string[];
  score: number;
  last_visit_days: number | null;
  open_deals_value: number;
  open_deals_count: number;
  renewal_date: string | null;
};

/**
 * Smart Visit Planner — ranks accounts the rep should visit next based on
 * staleness, deal value, renewal proximity, and health score (if available).
 */
export const getSmartPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repId?: string; limit?: number }) => input)
  .handler(async ({ data, context }): Promise<{ stops: SmartPlanStop[] }> => {
    const { supabase, userId } = context;
    const repId = data.repId ?? userId;
    const limit = data.limit ?? 15;

    // Get accounts that have open leads assigned to this rep
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, account_id, customer_name, expected_value, stage, renewal_date, last_activity_at")
      .eq("assigned_to", repId)
      .not("account_id", "is", null);

    if (!leads || leads.length === 0) return { stops: [] };

    // Group by account
    const byAccount = new Map<string, {
      name: string;
      value: number;
      count: number;
      renewal: string | null;
      lastActivity: string | null;
    }>();
    for (const l of leads) {
      if (l.stage === "won" || l.stage === "lost") continue;
      const key = l.account_id as string;
      const cur = byAccount.get(key) ?? { name: l.customer_name, value: 0, count: 0, renewal: null, lastActivity: null };
      cur.value += Number(l.expected_value ?? 0);
      cur.count += 1;
      if (l.renewal_date && (!cur.renewal || l.renewal_date < cur.renewal)) cur.renewal = l.renewal_date;
      if (l.last_activity_at && (!cur.lastActivity || l.last_activity_at > cur.lastActivity)) cur.lastActivity = l.last_activity_at;
      byAccount.set(key, cur);
    }

    const accountIds = [...byAccount.keys()];
    if (accountIds.length === 0) return { stops: [] };

    // Last visits per account from visit_checkins joined to leads
    const { data: visits } = await supabase
      .from("visit_checkins")
      .select("lead_id, checkin_time, crm_leads!inner(account_id)")
      .in("crm_leads.account_id", accountIds)
      .order("checkin_time", { ascending: false })
      .limit(1000);

    const lastVisitByAccount = new Map<string, string>();
    for (const v of (visits ?? []) as Array<{ checkin_time: string; crm_leads: { account_id: string } | null }>) {
      const acc = v.crm_leads?.account_id;
      if (!acc) continue;
      if (!lastVisitByAccount.has(acc)) lastVisitByAccount.set(acc, v.checkin_time);
    }

    const now = Date.now();
    const stops: SmartPlanStop[] = [];
    for (const [accountId, info] of byAccount) {
      const lastVisit = lastVisitByAccount.get(accountId);
      const lastDays = lastVisit ? Math.floor((now - new Date(lastVisit).getTime()) / 86400000) : null;
      const reasons: string[] = [];
      let score = 0;

      if (lastDays === null) { score += 40; reasons.push("Never visited"); }
      else if (lastDays > 60) { score += 35; reasons.push(`${lastDays} days since last visit`); }
      else if (lastDays > 30) { score += 20; reasons.push(`${lastDays} days since last visit`); }
      else if (lastDays > 14) { score += 10; reasons.push(`${lastDays} days since last visit`); }

      if (info.value > 100000) { score += 25; reasons.push(`High pipeline ($${Math.round(info.value / 1000)}k)`); }
      else if (info.value > 25000) { score += 15; reasons.push(`Active pipeline ($${Math.round(info.value / 1000)}k)`); }

      if (info.renewal) {
        const daysToRenewal = Math.floor((new Date(info.renewal).getTime() - now) / 86400000);
        if (daysToRenewal >= 0 && daysToRenewal < 90) {
          score += 20; reasons.push(`Renewal in ${daysToRenewal}d`);
        }
      }

      if (info.count >= 3) { score += 5; reasons.push(`${info.count} open deals`); }

      stops.push({
        account_id: accountId,
        account_name: info.name,
        reason: reasons,
        score,
        last_visit_days: lastDays,
        open_deals_value: info.value,
        open_deals_count: info.count,
        renewal_date: info.renewal,
      });
    }

    stops.sort((a, b) => b.score - a.score);
    return { stops: stops.slice(0, limit) };
  });

export type VisitBrief = {
  account_id: string;
  account_name: string;
  last_visit_summary: string | null;
  last_visit_date: string | null;
  open_next_actions: string[];
  open_deal_count: number;
  open_deal_value: number;
  recent_topics: string[];
  suggested_focus: string;
};

/** Auto Visit Briefs — one-page brief per account derived from visit history. */
export const getVisitBriefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accountIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<{ briefs: VisitBrief[] }> => {
    const { supabase } = context;
    if (!data.accountIds.length) return { briefs: [] };

    // Get account names and open leads
    const { data: accounts } = await supabase
      .from("crm_accounts")
      .select("id, name")
      .in("id", data.accountIds);

    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, account_id, expected_value, stage")
      .in("account_id", data.accountIds);

    const { data: visits } = await supabase
      .from("customer_visits")
      .select("id, account_id, meeting_at, discussion_summary, next_action")
      .in("account_id", data.accountIds)
      .order("meeting_at", { ascending: false })
      .limit(500);

    const briefs: VisitBrief[] = [];
    for (const acc of accounts ?? []) {
      const accVisits = (visits ?? []).filter((v) => v.account_id === acc.id);
      const lastVisit = accVisits[0];
      const openLeads = (leads ?? []).filter((l) => l.account_id === acc.id && l.stage !== "won" && l.stage !== "lost");
      const openValue = openLeads.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);

      const recentTopics: string[] = [];
      for (const v of accVisits.slice(0, 5)) {
        if (v.discussion_summary) recentTopics.push(v.discussion_summary.slice(0, 120));
      }
      const openNext = accVisits
        .filter((v) => v.next_action && v.next_action.trim())
        .slice(0, 5)
        .map((v) => v.next_action as string);

      let focus = "Re-engage account";
      if (!lastVisit) focus = "First introduction — no prior visit history";
      else if (openLeads.length > 0 && openValue > 50000) focus = `Advance ${openLeads.length} open deal(s) worth $${Math.round(openValue / 1000)}k`;
      else if (openNext.length > 0) focus = `Follow up on: ${openNext[0]}`;

      briefs.push({
        account_id: acc.id,
        account_name: acc.name,
        last_visit_summary: lastVisit?.discussion_summary ?? null,
        last_visit_date: lastVisit?.meeting_at ?? null,
        open_next_actions: openNext,
        open_deal_count: openLeads.length,
        open_deal_value: openValue,
        recent_topics: recentTopics,
        suggested_focus: focus,
      });
    }

    return { briefs };
  });

export type OneOnOneSnapshot = {
  rep_id: string;
  rep_name: string;
  visits_last_30: number;
  low_quality_count: number;
  unique_accounts_visited: number;
  open_pipeline_value: number;
  deals_won_30: number;
  deals_lost_30: number;
  stale_accounts: number;
  highlights: string[];
  concerns: string[];
};

/** Manager 1:1 Prep — per-rep activity & health snapshot for managers. */
export const getOneOnOneSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repId: string }) => input)
  .handler(async ({ data, context }): Promise<OneOnOneSnapshot | null> => {
    const { supabase } = context;
    const repId = data.repId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", repId)
      .maybeSingle();
    if (!profile) return null;

    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    const [{ data: visits }, { data: lowQ }, { data: leads }] = await Promise.all([
      supabase
        .from("customer_visits")
        .select("id, account_id, meeting_at")
        .eq("user_id", repId)
        .gte("meeting_at", since),
      supabase
        .from("visit_quality_flags")
        .select("id")
        .eq("user_id", repId)
        .gte("detected_at", since),
      supabase
        .from("crm_leads")
        .select("id, account_id, expected_value, stage, won_at, lost_at, last_activity_at")
        .eq("assigned_to", repId),
    ]);

    const visitsArr = visits ?? [];
    const uniqueAccounts = new Set<string>();
    for (const v of visitsArr) if (v.account_id) uniqueAccounts.add(v.account_id);

    const leadsArr = leads ?? [];
    const openPipeline = leadsArr
      .filter((l) => l.stage !== "won" && l.stage !== "lost")
      .reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
    const won30 = leadsArr.filter((l) => l.won_at && l.won_at >= since).length;
    const lost30 = leadsArr.filter((l) => l.lost_at && l.lost_at >= since).length;

    const staleCutoff = new Date(Date.now() - 21 * 86400000).toISOString();
    const stale = leadsArr.filter(
      (l) => l.stage !== "won" && l.stage !== "lost" && (!l.last_activity_at || l.last_activity_at < staleCutoff),
    ).length;

    const highlights: string[] = [];
    const concerns: string[] = [];
    if (visitsArr.length >= 20) highlights.push(`${visitsArr.length} visits in last 30 days — strong field activity`);
    if (won30 > 0) highlights.push(`${won30} deal(s) won in last 30 days`);
    if (openPipeline > 100000) highlights.push(`$${Math.round(openPipeline / 1000)}k open pipeline`);

    if (visitsArr.length < 8) concerns.push(`Only ${visitsArr.length} visits in last 30 days`);
    if ((lowQ?.length ?? 0) > 3) concerns.push(`${lowQ!.length} low-quality visits flagged`);
    if (stale > 5) concerns.push(`${stale} open deals with no activity in 21+ days`);
    if (lost30 > won30 && lost30 > 2) concerns.push(`Lost ${lost30} deals vs ${won30} won`);

    return {
      rep_id: repId,
      rep_name: profile.full_name ?? profile.email ?? "Rep",
      visits_last_30: visitsArr.length,
      low_quality_count: lowQ?.length ?? 0,
      unique_accounts_visited: uniqueAccounts.size,
      open_pipeline_value: openPipeline,
      deals_won_30: won30,
      deals_lost_30: lost30,
      stale_accounts: stale,
      highlights,
      concerns,
    };
  });

export const listReps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    return { reps: data ?? [] };
  });
