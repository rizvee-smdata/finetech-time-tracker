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

    const [{ data: oemRows }, { data: leads }] = await Promise.all([
      supabase.from("crm_oems").select("id, name").eq("company_id", companyId),
      supabase.from("crm_leads")
        .select("id, oem_id, product_name, account_id, stage, expected_value, won_at, stage_changed_at, created_at")
        .eq("company_id", companyId)
        .or(`stage_changed_at.gte.${since},created_at.gte.${since}`),
    ]);

    if (!leads?.length) return { rows: [] };

    // Bucket leads by vendor key: OEM id if set, else product name.
    const oemNameById = new Map((oemRows ?? []).map((o) => [o.id, o.name]));
    type Bucket = { key: string; name: string; leads: typeof leads };
    const buckets = new Map<string, Bucket>();
    for (const l of leads) {
      let key: string | null = null;
      let name: string | null = null;
      if (l.oem_id && oemNameById.has(l.oem_id)) {
        key = `oem:${l.oem_id}`;
        name = oemNameById.get(l.oem_id)!;
      } else if (l.product_name && l.product_name.trim()) {
        const t = l.product_name.trim();
        key = `product:${t.toLowerCase()}`;
        name = t;
      }
      if (!key || !name) continue;
      let b = buckets.get(key);
      if (!b) { b = { key, name, leads: [] }; buckets.set(key, b); }
      b.leads.push(l);
    }

    if (buckets.size === 0) return { rows: [] };

    // Visits for any accounts referenced
    const accountIds = Array.from(new Set(leads.map((l) => l.account_id).filter(Boolean) as string[]));
    const { data: visits } = accountIds.length
      ? await supabase.from("customer_visits")
          .select("account_id, meeting_at")
          .eq("company_id", companyId)
          .in("account_id", accountIds)
          .gte("meeting_at", since)
      : { data: [] as { account_id: string | null; meeting_at: string | null }[] };

    const rows: OemHealthRow[] = Array.from(buckets.values()).map((b) => {
      const won = b.leads.filter((l) => l.stage === "won");
      const lost = b.leads.filter((l) => l.stage === "lost");
      const active = b.leads.filter((l) => !["won", "lost"].includes(l.stage));
      const wonValue = won.reduce((s, l) => s + (Number(l.expected_value) || 0), 0);
      const total = won.length + lost.length;
      const winRate = total ? Math.round((won.length / total) * 100) : 0;
      const accts = new Set(b.leads.map((l) => l.account_id).filter(Boolean) as string[]);
      const bVisits = (visits ?? []).filter((v) => v.account_id && accts.has(v.account_id));
      const uniqueVisited = new Set(bVisits.map((v) => v.account_id!)).size;

      const reasons: string[] = [];
      let health: "strong" | "watch" | "at_risk" = "strong";
      if (active.length === 0 && won.length === 0) { reasons.push("No activity in period"); health = "at_risk"; }
      if (total >= 3 && winRate < 30) { reasons.push(`Low win-rate ${winRate}%`); health = "at_risk"; }
      else if (total >= 3 && winRate < 50) { reasons.push(`Win-rate ${winRate}%`); health = health === "at_risk" ? "at_risk" : "watch"; }
      if (accts.size > 0 && uniqueVisited / accts.size < 0.3) {
        reasons.push("Low visit coverage on vendor accounts");
        health = health === "at_risk" ? "at_risk" : "watch";
      }
      if (reasons.length === 0) reasons.push("Healthy pipeline & coverage");

      return {
        oem_id: b.key,
        oem_name: b.name,
        active_leads: active.length,
        won_count: won.length,
        won_value: wonValue,
        lost_count: lost.length,
        win_rate: winRate,
        total_visits: bVisits.length,
        unique_accounts_visited: uniqueVisited,
        health,
        reasons,
      };
    });

    rows.sort((a, b) => (b.won_value + b.active_leads) - (a.won_value + a.active_leads));
    return { rows };
  });
