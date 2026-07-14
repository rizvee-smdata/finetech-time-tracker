import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AttributionModel = "first_touch" | "last_touch" | "linear" | "time_decay" | "u_shaped";

const InputSchema = z.object({
  companyId: z.string().uuid(),
  model: z.enum(["first_touch", "last_touch", "linear", "time_decay", "u_shaped"]).default("linear"),
  from: z.string().optional(),
  to: z.string().optional(),
});

type Touch = {
  id: string;
  lead_id: string | null;
  source: string;
  channel: string | null;
  campaign: string | null;
  touch_kind: "first" | "mid" | "conversion";
  occurred_at: string;
  revenue_value: number | null;
  currency: string | null;
};

/**
 * Distribute a deal's revenue across its touchpoints per model.
 * Returns { source, channel, credit }[] rows aggregated across all deals.
 */
export const computeAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("attribution_touchpoints")
      .select("id, lead_id, source, channel, campaign, touch_kind, occurred_at, revenue_value, currency")
      .eq("company_id", data.companyId)
      .order("occurred_at", { ascending: true })
      .limit(20000);
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const touches = (rows ?? []) as Touch[];

    // Group by lead_id, compute credit per touch by model
    const byLead = new Map<string, Touch[]>();
    for (const t of touches) {
      if (!t.lead_id) continue;
      if (!byLead.has(t.lead_id)) byLead.set(t.lead_id, []);
      byLead.get(t.lead_id)!.push(t);
    }

    type Credit = { source: string; channel: string; campaign: string; credit: number; deals: number };
    const bucket = new Map<string, Credit>();
    const totals = { attributedRevenue: 0, deals: 0, touches: touches.length };

    for (const [leadId, list] of byLead) {
      const conv = list.find((x) => x.touch_kind === "conversion");
      if (!conv || !conv.revenue_value) continue;
      const revenue = Number(conv.revenue_value);
      totals.attributedRevenue += revenue;
      totals.deals += 1;

      // Touches to credit = everything up to and including conversion, excluding conversion touch itself
      const path = list.filter((t) => t.occurred_at <= conv.occurred_at && t.id !== conv.id);
      if (path.length === 0) continue;

      const weights = computeWeights(path, conv, data.model);

      path.forEach((t, i) => {
        const w = weights[i] ?? 0;
        if (w <= 0) return;
        const key = `${t.source}||${t.channel ?? ""}||${t.campaign ?? ""}`;
        const prior = bucket.get(key) ?? { source: t.source, channel: t.channel ?? "", campaign: t.campaign ?? "", credit: 0, deals: 0 };
        prior.credit += revenue * w;
        prior.deals += w; // fractional deal credit
        bucket.set(key, prior);
      });
      // discard unused var
      void leadId;
    }

    const breakdown = Array.from(bucket.values()).sort((a, b) => b.credit - a.credit);
    return { totals, breakdown };
  });

function computeWeights(path: Touch[], conv: Touch, model: AttributionModel): number[] {
  const n = path.length;
  if (n === 0) return [];
  switch (model) {
    case "first_touch": {
      const w = new Array(n).fill(0); w[0] = 1; return w;
    }
    case "last_touch": {
      const w = new Array(n).fill(0); w[n - 1] = 1; return w;
    }
    case "linear":
      return new Array(n).fill(1 / n);
    case "time_decay": {
      // 7-day half-life relative to conversion timestamp
      const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
      const convMs = new Date(conv.occurred_at).getTime();
      const raw = path.map((t) => {
        const ageMs = convMs - new Date(t.occurred_at).getTime();
        return Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs);
      });
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      return raw.map((v) => v / sum);
    }
    case "u_shaped": {
      if (n === 1) return [1];
      if (n === 2) return [0.5, 0.5];
      const mid = 0.2 / (n - 2);
      const w = new Array(n).fill(mid);
      w[0] = 0.4; w[n - 1] = 0.4;
      return w;
    }
  }
}

export const listRecentTouches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid(), limit: z.number().min(1).max(500).default(100) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("attribution_touchpoints")
      .select("id, lead_id, source, channel, campaign, touch_kind, occurred_at, revenue_value, currency")
      .eq("company_id", data.companyId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
