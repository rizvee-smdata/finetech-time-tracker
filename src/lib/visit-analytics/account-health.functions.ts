import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AccountHealthRow = {
  account_id: string;
  account_name: string;
  score: number;
  rag: "green" | "amber" | "red";
  last_visit_days: number | null;
  open_deals_count: number;
  open_deals_value: number;
  renewal_risk: boolean;
  drivers: string[];
};

/**
 * Account Health Composite — blends visit cadence, deal velocity, renewal proximity,
 * and quality flags into a single account-level health score.
 */
export const getAccountHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ rows: AccountHealthRow[] }> => {
    const { supabase } = context;
    const limit = data.limit ?? 50;

    const { data: accounts } = await supabase
      .from("crm_accounts")
      .select("id, name")
      .limit(300);
    if (!accounts?.length) return { rows: [] };

    const ids = accounts.map((a: any) => a.id);
    const [{ data: leads }, { data: visits }] = await Promise.all([
      supabase
        .from("crm_leads")
        .select("id, account_id, stage, expected_value, renewal_date, last_activity_at")
        .in("account_id", ids),
      supabase
        .from("customer_visits")
        .select("id, lead_id, meeting_at, is_low_quality")
        .gte("meeting_at", new Date(Date.now() - 180 * 86400000).toISOString()),
    ]);

    const leadAcct = new Map<string, string>();
    const byAccountLeads = new Map<string, any[]>();
    for (const l of (leads ?? []) as any[]) {
      if (!l.account_id) continue;
      leadAcct.set(l.id, l.account_id);
      if (!byAccountLeads.has(l.account_id)) byAccountLeads.set(l.account_id, []);
      byAccountLeads.get(l.account_id)!.push(l);
    }
    const byAccountVisits = new Map<string, any[]>();
    for (const v of (visits ?? []) as any[]) {
      const aid = v.lead_id ? leadAcct.get(v.lead_id) : null;
      if (!aid) continue;
      if (!byAccountVisits.has(aid)) byAccountVisits.set(aid, []);
      byAccountVisits.get(aid)!.push(v);
    }

    const now = Date.now();
    const rows: AccountHealthRow[] = accounts.map((a: any) => {
      const ls = byAccountLeads.get(a.id) ?? [];
      const vs = byAccountVisits.get(a.id) ?? [];
      const open = ls.filter((l) => l.stage !== "won" && l.stage !== "lost");
      const openValue = open.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
      const lastVisit = vs.length
        ? Math.max(...vs.map((v) => new Date(v.meeting_at).getTime()))
        : null;
      const lastVisitDays = lastVisit ? Math.floor((now - lastVisit) / 86400000) : null;
      const lowQ = vs.filter((v) => v.is_low_quality).length;

      const upcomingRenewal = ls.find(
        (l) => l.renewal_date && new Date(l.renewal_date).getTime() - now < 90 * 86400000 && new Date(l.renewal_date).getTime() > now,
      );

      let score = 100;
      const drivers: string[] = [];
      if (lastVisitDays === null) { score -= 30; drivers.push("Never visited"); }
      else if (lastVisitDays > 60) { score -= 25; drivers.push(`${lastVisitDays}d since visit`); }
      else if (lastVisitDays > 30) { score -= 12; drivers.push(`${lastVisitDays}d since visit`); }
      if (lowQ > 0) { score -= Math.min(20, lowQ * 5); drivers.push(`${lowQ} low-quality visit(s)`); }
      if (open.length === 0 && ls.length > 0) { score -= 15; drivers.push("No open pipeline"); }
      if (upcomingRenewal && (lastVisitDays ?? 999) > 45) { score -= 20; drivers.push("Renewal <90d, stale visits"); }
      if (openValue > 1_000_000 && (lastVisitDays ?? 999) > 21) { score -= 10; drivers.push("High-value, not visited 21d+"); }

      score = Math.max(0, Math.min(100, score));
      const rag: AccountHealthRow["rag"] = score >= 70 ? "green" : score >= 40 ? "amber" : "red";

      return {
        account_id: a.id,
        account_name: a.name,
        score,
        rag,
        last_visit_days: lastVisitDays,
        open_deals_count: open.length,
        open_deals_value: openValue,
        renewal_risk: Boolean(upcomingRenewal),
        drivers,
      };
    });

    rows.sort((a, b) => a.score - b.score);
    return { rows: rows.slice(0, limit) };
  });
