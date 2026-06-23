import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VisitAnomaly = {
  kind: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  rep_id?: string | null;
  rep_name?: string | null;
  metadata?: Record<string, number | string | boolean>;
};

/**
 * Visit-Anomaly Detector — surfaces unusual patterns: cadence drops, geofence
 * violations, low-quality streaks, ghost visits.
 */
export const getVisitAnomalies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lookbackDays?: number }) => input ?? {})
  .handler(async ({ data, context }): Promise<{ anomalies: VisitAnomaly[] }> => {
    const { supabase } = context;
    const lookback = data.lookbackDays ?? 14;
    const start = new Date(Date.now() - lookback * 86400000).toISOString();
    const halfStart = new Date(Date.now() - (lookback / 2) * 86400000).toISOString();

    const [{ data: visits }, { data: profiles }, { data: flags }] = await Promise.all([
      supabase
        .from("customer_visits")
        .select("id, user_id, meeting_at, is_low_quality")
        .gte("meeting_at", start),
      supabase.from("profiles").select("id, full_name, email").limit(500),
      supabase
        .from("visit_quality_flags")
        .select("id, user_id, detected_at")
        .gte("detected_at", start),
    ]);

    const profById = new Map<string, any>(((profiles ?? []) as any[]).map((p) => [p.id, p]));
    const nameOf = (id: string) => profById.get(id)?.full_name || profById.get(id)?.email || "Rep";

    const out: VisitAnomaly[] = [];

    // 1. Cadence drop per rep
    const counts = new Map<string, { recent: number; prior: number }>();
    for (const v of (visits ?? []) as any[]) {
      const t = new Date(v.meeting_at).getTime();
      const c = counts.get(v.user_id) ?? { recent: 0, prior: 0 };
      if (t >= new Date(halfStart).getTime()) c.recent += 1;
      else c.prior += 1;
      counts.set(v.user_id, c);
    }
    for (const [uid, c] of counts.entries()) {
      if (c.prior >= 3 && c.recent <= Math.floor(c.prior * 0.5)) {
        const drop = Math.round(((c.prior - c.recent) / c.prior) * 100);
        out.push({
          kind: "cadence_drop",
          severity: drop >= 70 ? "high" : "medium",
          title: `${nameOf(uid)} visit cadence dropped ${drop}%`,
          description: `${c.recent} visits in the last ${Math.floor(lookback / 2)} days vs ${c.prior} prior.`,
          rep_id: uid,
          rep_name: nameOf(uid),
          metadata: { recent: c.recent, prior: c.prior, drop_pct: drop },
        });
      }
    }

    // 2. Low-quality streak per rep
    const lq = new Map<string, number>();
    for (const f of (flags ?? []) as any[]) {
      lq.set(f.user_id, (lq.get(f.user_id) ?? 0) + 1);
    }
    for (const [uid, n] of lq.entries()) {
      if (n >= 3) {
        out.push({
          kind: "low_quality_streak",
          severity: n >= 6 ? "high" : "medium",
          title: `${nameOf(uid)} flagged ${n} low-quality visits`,
          description: `Multiple visits missing notes or next actions in the last ${lookback} days.`,
          rep_id: uid,
          rep_name: nameOf(uid),
          metadata: { count: n, lookback_days: lookback },
        });
      }
    }

    // 3. No visits at all in lookback window
    const allUserIds = new Set<string>([...counts.keys()]);
    for (const p of (profiles ?? []) as any[]) {
      if (!allUserIds.has(p.id)) {
        // Only flag if they had visits historically — check 30d window
        const { count } = await supabase
          .from("customer_visits")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .gte("meeting_at", new Date(Date.now() - 60 * 86400000).toISOString())
          .lt("meeting_at", start);
        if ((count ?? 0) >= 3) {
          out.push({
            kind: "no_recent_visits",
            severity: "medium",
            title: `${nameOf(p.id)} logged 0 visits in ${lookback} days`,
            description: `Active in prior 60 days but no visits in the last ${lookback}.`,
            rep_id: p.id,
            rep_name: nameOf(p.id),
            metadata: { lookback_days: lookback, prior_60d_count: count ?? 0 },
          });
        }
      }
    }

    out.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "high" ? -1 : b.severity === "high" ? 1 : a.severity === "medium" ? -1 : 1,
    );
    return { anomalies: out };
  });
