import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { haversineKm, detectArea } from "./utils";

const InputSchema = z.object({
  company_id: z.string().uuid(),
  current_area: z.string().nullable().optional(),
  current_lat: z.number().nullable().optional(),
  current_lng: z.number().nullable().optional(),
  exclude_lead_ids: z.array(z.string().uuid()).default([]),
  limit: z.number().int().min(1).max(10).default(5),
});

export interface NearbySuggestion {
  lead_id: string;
  client_name: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
  open_deal_value: number | null;
  days_since_last_visit: number | null;
  distance_km: number | null;
  reason: string;
}

export const suggestNearby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<NearbySuggestion[]> => {
    const { supabase, userId } = context;

    const { data: leads } = await supabase
      .from("crm_leads")
      .select("id, customer_name, location, address_lat, address_lng, expected_value, stage, last_activity_at")
      .eq("company_id", data.company_id)
      .eq("assigned_to", userId)
      .not("stage", "in", "(won,lost)")
      .limit(200);

    const results: NearbySuggestion[] = [];
    const now = Date.now();

    for (const l of leads ?? []) {
      if (data.exclude_lead_ids.includes(l.id)) continue;
      const area = detectArea(l.location);
      const days = l.last_activity_at
        ? Math.floor((now - new Date(l.last_activity_at).getTime()) / 86400000)
        : 999;

      let distance: number | null = null;
      if (l.address_lat != null && l.address_lng != null && data.current_lat != null && data.current_lng != null) {
        distance = haversineKm(
          { lat: data.current_lat, lng: data.current_lng },
          { lat: l.address_lat, lng: l.address_lng },
        );
      }

      // Match: same area OR within 3km
      const sameArea = data.current_area && area === data.current_area;
      const close = distance != null && distance <= 3;
      if (!sameArea && !close) continue;

      const reasons: string[] = [];
      if (days >= 30) reasons.push(`${days} days since last contact`);
      if (l.expected_value && l.expected_value > 0) reasons.push(`open deal ${formatBdt(l.expected_value)}`);
      if (sameArea) reasons.push(`same area (${area})`);
      else if (distance != null) reasons.push(`${distance.toFixed(1)} km away`);

      results.push({
        lead_id: l.id,
        client_name: l.customer_name,
        area,
        lat: l.address_lat,
        lng: l.address_lng,
        open_deal_value: l.expected_value ? Number(l.expected_value) : null,
        days_since_last_visit: days,
        distance_km: distance,
        reason: reasons.join(" • "),
      });
    }

    // Sort: highest deal value × stalest first
    results.sort((a, b) => {
      const sa = (a.open_deal_value ?? 0) * Math.max(1, a.days_since_last_visit ?? 0);
      const sb = (b.open_deal_value ?? 0) * Math.max(1, b.days_since_last_visit ?? 0);
      return sb - sa;
    });

    return results.slice(0, data.limit);
  });

function formatBdt(n: number): string {
  return "৳" + new Intl.NumberFormat("en-IN").format(Math.round(n));
}
