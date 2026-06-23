import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ horizonDays: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(180)]).default(90) });

export type RenewalRow = {
  lead_id: string;
  account_id: string | null;
  customer_name: string;
  company_name: string | null;
  renewal_date: string;
  expected_value: number | null;
  currency: string;
  assigned_to: string | null;
  rep_name: string | null;
  last_visit_at: string | null;
  days_since_visit: number | null;
  days_to_renewal: number;
  risk: "high" | "medium" | "low";
  risk_reasons: string[];
};

export const getRenewalRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<{ rows: RenewalRow[] }> => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = cm?.company_id;
    if (!companyId) return { rows: [] };

    const today = new Date();
    const horizon = new Date(today.getTime() + data.horizonDays * 86400_000);

    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, account_id, customer_name, company_name, renewal_date, expected_value, currency, assigned_to")
      .eq("company_id", companyId)
      .eq("stage", "won")
      .neq("renewal_kind", "one_time")
      .not("renewal_date", "is", null)
      .lte("renewal_date", horizon.toISOString().slice(0, 10))
      .gte("renewal_date", today.toISOString().slice(0, 10));

    if (!leads?.length) return { rows: [] };

    const accountIds = Array.from(new Set(leads.map((l) => l.account_id).filter(Boolean) as string[]));
    const repIds = Array.from(new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[]));

    const [{ data: visits }, { data: profiles }] = await Promise.all([
      accountIds.length
        ? supabase.from("customer_visits").select("account_id, meeting_at").eq("company_id", companyId).in("account_id", accountIds).order("meeting_at", { ascending: false })
        : Promise.resolve({ data: [] as { account_id: string | null; meeting_at: string | null }[] }),
      repIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", repIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    ]);

    const lastVisitByAccount = new Map<string, string>();
    (visits ?? []).forEach((v) => {
      if (v.account_id && v.meeting_at && !lastVisitByAccount.has(v.account_id)) {
        lastVisitByAccount.set(v.account_id, v.meeting_at);
      }
    });

    const rows: RenewalRow[] = leads.map((l) => {
      const last = l.account_id ? lastVisitByAccount.get(l.account_id) ?? null : null;
      const daysSinceVisit = last ? Math.floor((today.getTime() - new Date(last).getTime()) / 86400_000) : null;
      const daysToRenewal = Math.max(0, Math.floor((new Date(l.renewal_date!).getTime() - today.getTime()) / 86400_000));
      const reasons: string[] = [];
      let risk: "high" | "medium" | "low" = "low";
      if (daysSinceVisit === null) { reasons.push("No visits logged"); risk = "high"; }
      else if (daysSinceVisit > 60) { reasons.push(`Last visit ${daysSinceVisit}d ago`); risk = "high"; }
      else if (daysSinceVisit > 30) { reasons.push(`Last visit ${daysSinceVisit}d ago`); risk = "medium"; }
      if (daysToRenewal <= 30 && risk !== "high") { reasons.push("Renewal <30 days"); risk = risk === "low" ? "medium" : risk; }
      if (daysToRenewal <= 14) { reasons.push("Renewal imminent"); risk = "high"; }

      const p = profiles?.find((x) => x.id === l.assigned_to);
      return {
        lead_id: l.id,
        account_id: l.account_id,
        customer_name: l.customer_name,
        company_name: l.company_name,
        renewal_date: l.renewal_date!,
        expected_value: l.expected_value,
        currency: l.currency,
        assigned_to: l.assigned_to,
        rep_name: p?.full_name ?? p?.email ?? null,
        last_visit_at: last,
        days_since_visit: daysSinceVisit,
        days_to_renewal: daysToRenewal,
        risk,
        risk_reasons: reasons,
      };
    });

    rows.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
      return a.days_to_renewal - b.days_to_renewal;
    });

    return { rows };
  });
