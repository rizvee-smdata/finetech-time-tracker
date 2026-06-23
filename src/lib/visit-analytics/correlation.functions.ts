import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ periodDays: z.union([z.literal(90), z.literal(180), z.literal(365)]).default(180) });

export type DealCorrelationResult = {
  totalWon: number;
  totalLost: number;
  avgVisitsWon: number;
  avgVisitsLost: number;
  winRateBuckets: { bucket: string; wins: number; losses: number; winRate: number }[];
  topReps: { user_id: string; full_name: string; wins: number; avgVisits: number }[];
};

export const getDealCorrelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<DealCorrelationResult> => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = cm?.company_id;
    const empty: DealCorrelationResult = {
      totalWon: 0, totalLost: 0, avgVisitsWon: 0, avgVisitsLost: 0,
      winRateBuckets: [], topReps: [],
    };
    if (!companyId) return empty;

    const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();
    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, account_id, assigned_to, stage, won_at, lost_at, stage_changed_at")
      .eq("company_id", companyId)
      .in("stage", ["won", "lost"])
      .gte("stage_changed_at", since);

    const wonLeads = (leads ?? []).filter((l) => l.stage === "won" && l.account_id);
    const lostLeads = (leads ?? []).filter((l) => l.stage === "lost" && l.account_id);

    const accountIds = Array.from(new Set([...wonLeads, ...lostLeads].map((l) => l.account_id).filter(Boolean) as string[]));
    if (accountIds.length === 0) return empty;

    const { data: visits } = await supabase
      .from("customer_visits")
      .select("user_id, meeting_at, account_id")
      .eq("company_id", companyId)
      .in("account_id", accountIds)
      .gte("meeting_at", new Date(Date.now() - (data.periodDays + 120) * 86400_000).toISOString());

    const countVisitsBefore = (accountId: string, beforeIso: string) => {
      const before = new Date(beforeIso).getTime();
      const ninetyMs = 90 * 86400_000;
      return (visits ?? []).filter(
        (v) => v.account_id === accountId && v.meeting_at && new Date(v.meeting_at).getTime() <= before && new Date(v.meeting_at).getTime() >= before - ninetyMs
      ).length;
    };

    const wonCounts = wonLeads.map((l) => countVisitsBefore(l.account_id!, l.won_at ?? l.stage_changed_at!));
    const lostCounts = lostLeads.map((l) => countVisitsBefore(l.account_id!, l.lost_at ?? l.stage_changed_at!));
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const buckets = [
      { label: "0", min: 0, max: 0 },
      { label: "1-2", min: 1, max: 2 },
      { label: "3-5", min: 3, max: 5 },
      { label: "6+", min: 6, max: 999 },
    ];
    const winRateBuckets = buckets.map((b) => {
      const wins = wonCounts.filter((c) => c >= b.min && c <= b.max).length;
      const losses = lostCounts.filter((c) => c >= b.min && c <= b.max).length;
      const total = wins + losses;
      return { bucket: b.label, wins, losses, winRate: total ? Math.round((wins / total) * 100) : 0 };
    });

    const repAgg = new Map<string, { wins: number; visitTotals: number }>();
    wonLeads.forEach((l, i) => {
      if (!l.assigned_to) return;
      const v = repAgg.get(l.assigned_to) ?? { wins: 0, visitTotals: 0 };
      v.wins += 1; v.visitTotals += wonCounts[i] ?? 0;
      repAgg.set(l.assigned_to, v);
    });
    const repIds = Array.from(repAgg.keys());
    const { data: profiles } = repIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", repIds)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const topReps = Array.from(repAgg.entries())
      .map(([uid, v]) => {
        const p = profiles?.find((x) => x.id === uid);
        return {
          user_id: uid,
          full_name: p?.full_name ?? p?.email ?? "Unknown",
          wins: v.wins,
          avgVisits: Number((v.visitTotals / Math.max(1, v.wins)).toFixed(1)),
        };
      })
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);

    return {
      totalWon: wonLeads.length,
      totalLost: lostLeads.length,
      avgVisitsWon: Number(avg(wonCounts).toFixed(1)),
      avgVisitsLost: Number(avg(lostCounts).toFixed(1)),
      winRateBuckets,
      topReps,
    };
  });
