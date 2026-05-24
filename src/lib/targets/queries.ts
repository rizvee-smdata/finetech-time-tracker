import { supabase } from "@/integrations/supabase/client";
import type { Target, TargetMetric } from "./types";

const sb = supabase as unknown as { from: (t: string) => any };

export async function fetchTargets(companyId: string): Promise<Target[]> {
  const { data, error } = await sb
    .from("targets")
    .select("*")
    .eq("company_id", companyId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Target[];
}

export async function deleteTarget(id: string) {
  const { error } = await sb.from("targets").delete().eq("id", id);
  if (error) throw error;
}

export async function createTarget(input: Partial<Target> & {
  company_id: string;
  scope: Target["scope"];
  metric: TargetMetric;
  period_kind: Target["period_kind"];
  period_start: string;
  period_end: string;
  target_value: number;
}) {
  const { data, error } = await sb.from("targets").insert(input).select().single();
  if (error) throw error;
  return data as Target;
}

/** Compute actual achieved value for a single target by querying source tables. */
export async function computeTargetActual(t: Target): Promise<number> {
  const startIso = `${t.period_start}T00:00:00`;
  const endIso = `${t.period_end}T23:59:59`;

  // Build filter based on scope
  const applyLeadScope = (q: any) => {
    if (t.scope === "user" && t.user_id) q = q.eq("assigned_to", t.user_id);
    if (t.scope === "territory" && t.territory_id) q = q.eq("territory_id", t.territory_id);
    return q;
  };
  const applyVisitScope = (q: any) => {
    if (t.scope === "user" && t.user_id) q = q.eq("user_id", t.user_id);
    // visits don't have territory; for territory scope, return 0 by skipping
    return q;
  };

  switch (t.metric) {
    case "revenue": {
      let q = sb.from("crm_leads").select("expected_value")
        .eq("company_id", t.company_id).eq("stage", "won")
        .gte("won_at", startIso).lte("won_at", endIso);
      q = applyLeadScope(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.expected_value ?? 0), 0);
    }
    case "won_leads": {
      let q = sb.from("crm_leads").select("id", { count: "exact", head: true })
        .eq("company_id", t.company_id).eq("stage", "won")
        .gte("won_at", startIso).lte("won_at", endIso);
      q = applyLeadScope(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    }
    case "new_leads": {
      let q = sb.from("crm_leads").select("id", { count: "exact", head: true })
        .eq("company_id", t.company_id)
        .gte("created_at", startIso).lte("created_at", endIso);
      q = applyLeadScope(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    }
    case "quotes_sent": {
      let leadIds: string[] | null = null;
      if (t.scope !== "company") {
        let lq = sb.from("crm_leads").select("id").eq("company_id", t.company_id);
        if (t.scope === "user" && t.user_id) lq = lq.eq("assigned_to", t.user_id);
        if (t.scope === "territory" && t.territory_id) lq = lq.eq("territory_id", t.territory_id);
        const { data: leads } = await lq;
        leadIds = ((leads ?? []) as any[]).map((l) => l.id);
        if (!leadIds.length) return 0;
      }
      let q = sb.from("crm_quotes").select("id", { count: "exact", head: true })
        .in("status", ["sent", "accepted"])
        .gte("sent_at", startIso).lte("sent_at", endIso);
      if (leadIds) q = q.in("lead_id", leadIds);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    }
    case "visits":
    case "meetings": {
      if (t.scope === "territory") return 0;
      let q = sb.from("customer_visits").select("id", { count: "exact", head: true })
        .eq("company_id", t.company_id)
        .gte("meeting_at", startIso).lte("meeting_at", endIso);
      q = applyVisitScope(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    }
  }
}
