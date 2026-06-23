import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DealPrediction = {
  lead_id: string;
  customer_name: string;
  stage: string;
  expected_value: number;
  win_probability: number;
  predicted_close_days: number | null;
  signals: string[];
};

/**
 * Visit Outcome Predictor — uses recent visit cadence, quality, and stage velocity
 * to estimate likelihood of a deal closing and expected timeframe.
 */
export const getDealPredictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { repId?: string; limit?: number }) => input)
  .handler(async ({ data, context }): Promise<{ predictions: DealPrediction[] }> => {
    const { supabase, userId } = context;
    const repId = data.repId ?? userId;
    const limit = data.limit ?? 25;

    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, customer_name, stage, expected_value, last_activity_at, stage_changed_at, probability, account_id, assigned_to")
      .eq("assigned_to", repId)
      .not("stage", "in", "(won,lost)")
      .limit(200);

    if (!leads?.length) return { predictions: [] };

    const leadIds = leads.map((l: any) => l.id);
    const { data: visits } = await supabase
      .from("customer_visits")
      .select("id, lead_id, meeting_at, is_low_quality")
      .in("lead_id", leadIds)
      .gte("meeting_at", new Date(Date.now() - 90 * 86400000).toISOString());

    const visitsByLead = new Map<string, any[]>();
    for (const v of (visits ?? []) as any[]) {
      if (!v.lead_id) continue;
      if (!visitsByLead.has(v.lead_id)) visitsByLead.set(v.lead_id, []);
      visitsByLead.get(v.lead_id)!.push(v);
    }

    const stageWeights: Record<string, number> = {
      new: 10, initial_contact: 20, pricing: 35, negotiation: 55, closure: 75,
    };

    const predictions: DealPrediction[] = leads.map((l: any) => {
      const vs = visitsByLead.get(l.id) ?? [];
      const recentVisits = vs.length;
      const qualityVisits = vs.filter((v) => !v.is_low_quality).length;
      const daysSinceStage = l.stage_changed_at
        ? Math.floor((Date.now() - new Date(l.stage_changed_at).getTime()) / 86400000)
        : 999;
      const daysSinceActivity = l.last_activity_at
        ? Math.floor((Date.now() - new Date(l.last_activity_at).getTime()) / 86400000)
        : 999;

      let prob = stageWeights[l.stage] ?? 15;
      const signals: string[] = [];

      if (qualityVisits >= 3) { prob += 20; signals.push(`${qualityVisits} quality visits (90d)`); }
      else if (qualityVisits >= 1) { prob += 10; signals.push(`${qualityVisits} quality visit(s)`); }
      else { prob -= 15; signals.push("No quality visits in 90d"); }

      if (daysSinceActivity > 14) { prob -= 20; signals.push(`Stale: ${daysSinceActivity}d no activity`); }
      else if (daysSinceActivity < 5) { prob += 8; signals.push("Recent activity"); }

      if (daysSinceStage > 30) { prob -= 10; signals.push(`Stuck in ${l.stage} ${daysSinceStage}d`); }

      prob = Math.max(2, Math.min(95, prob));

      // ETA: velocity-based — fewer days = sooner. Stage closer to closure & active = sooner.
      let eta: number | null = null;
      if (prob >= 25) {
        const base = 90 - (stageWeights[l.stage] ?? 15);
        eta = Math.max(7, base - qualityVisits * 5 + Math.min(30, daysSinceActivity));
      }

      return {
        lead_id: l.id,
        customer_name: l.customer_name,
        stage: l.stage,
        expected_value: Number(l.expected_value ?? 0),
        win_probability: Math.round(prob),
        predicted_close_days: eta,
        signals,
      };
    });

    predictions.sort((a, b) => b.win_probability * b.expected_value - a.win_probability * a.expected_value);
    return { predictions: predictions.slice(0, limit) };
  });
