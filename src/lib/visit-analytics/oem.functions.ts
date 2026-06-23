import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ periodDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).default(90) });

export type OemHealthRow = {
  oem_id: string;
  oem_name: string;
  active_leads: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  win_rate: number;
  total_visits: number;
  unique_accounts_visited: number;
  health: "strong" | "watch" | "at_risk";
  reasons: string[];
};

export const getOemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: OemHealthRow[] }> => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = cm?.company_id;
    if (!companyId) return { rows: [] };

    const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();

    const [{ data: oems }, { data: leads }] = await Promise.all([
      supabase.from("crm_oems").select("id, name").eq("company_id", companyId).eq("is_active", true),
      supabase.from("crm_leads")
        .select("id, oem_id, account_id, stage, expected_value, won_at, stage_changed_at")
        .eq("company_id", companyId)
        .not("oem_id", "is", null)
        .gte("stage_changed_at", since),
    ]);

    if (!oems?.length) return { rows: [] };

    // Get visit counts per account in period
    const accountIds = Array.from(new Set((leads ?? []).map((l) => l.account_id).filter(Boolean) as string[]));
    const { data: visits } = accountIds.length
      ? await supabase.from("customer_visits")
          .select("account_id, meeting_at")
          .eq("company_id", companyId)
          .in("account_id", accountIds)
          .gte("meeting_at", since)
      : { data: [] as { account_id: string | null; meeting_at: string | null }[] };

    const rows: OemHealthRow[] = oems.map((oem) => {
      const oemLeads = (leads ?? []).filter((l) => l.oem_id === oem.id);
      const won = oemLeads.filter((l) => l.stage === "won");
      const lost = oemLeads.filter((l) => l.stage === "lost");
      const active = oemLeads.filter((l) => !["won", "lost"].includes(l.stage));
      const wonValue = won.reduce((s, l) => s + (Number(l.expected_value) || 0), 0);
      const total = won.length + lost.length;
      const winRate = total ? Math.round((won.length / total) * 100) : 0;
      const oemAccounts = new Set(oemLeads.map((l) => l.account_id).filter(Boolean) as string[]);
      const oemVisits = (visits ?? []).filter((v) => v.account_id && oemAccounts.has(v.account_id));
      const uniqueVisited = new Set(oemVisits.map((v) => v.account_id!)).size;

      const reasons: string[] = [];
      let health: "strong" | "watch" | "at_risk" = "strong";
      if (active.length === 0 && won.length === 0) { reasons.push("No activity in period"); health = "at_risk"; }
      if (total >= 3 && winRate < 30) { reasons.push(`Low win-rate ${winRate}%`); health = "at_risk"; }
      else if (total >= 3 && winRate < 50) { reasons.push(`Win-rate ${winRate}%`); health = health === "at_risk" ? "at_risk" : "watch"; }
      if (oemAccounts.size > 0 && uniqueVisited / oemAccounts.size < 0.3) {
        reasons.push("Low visit coverage on OEM accounts");
        health = health === "at_risk" ? "at_risk" : "watch";
      }
      if (reasons.length === 0) reasons.push("Healthy pipeline & coverage");

      return {
        oem_id: oem.id,
        oem_name: oem.name,
        active_leads: active.length,
        won_count: won.length,
        won_value: wonValue,
        lost_count: lost.length,
        win_rate: winRate,
        total_visits: oemVisits.length,
        unique_accounts_visited: uniqueVisited,
        health,
        reasons,
      };
    });

    rows.sort((a, b) => b.won_value - a.won_value);
    return { rows };
  });
