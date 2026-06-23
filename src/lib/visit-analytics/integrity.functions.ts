import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PeriodInput = z.object({ periodDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(30) });

type RepIntegrityRow = {
  user_id: string;
  full_name: string;
  total_checkins: number;
  valid_geofence: number;
  geofence_rate: number;
  total_visits: number;
  low_quality_visits: number;
  quality_rate: number;
  trend: { week: string; geofence_rate: number; quality_rate: number }[];
  severity: number;
};

export const getRepIntegrityScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PeriodInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    const companyId = cm?.company_id;
    if (!companyId) return { rows: [] as RepIntegrityRow[] };

    const since = new Date(Date.now() - data.periodDays * 86400_000).toISOString();

    const [{ data: checkins }, { data: visits }, { data: members }] = await Promise.all([
      supabase.from("visit_checkins")
        .select("user_id, is_geofence_valid, checkin_time")
        .eq("company_id", companyId).gte("checkin_time", since),
      supabase.from("customer_visits")
        .select("user_id, is_low_quality, meeting_at")
        .eq("company_id", companyId).gte("meeting_at", since),
      supabase.from("company_members").select("user_id").eq("company_id", companyId),
    ]);

    const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id)));
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name ?? p.email ?? "Unknown"]));

    const byUser = new Map<string, RepIntegrityRow>();
    const init = (uid: string): RepIntegrityRow => ({
      user_id: uid, full_name: nameOf.get(uid) ?? "Unknown",
      total_checkins: 0, valid_geofence: 0, geofence_rate: 1,
      total_visits: 0, low_quality_visits: 0, quality_rate: 1,
      trend: [], severity: 0,
    });

    for (const c of checkins ?? []) {
      const r = byUser.get(c.user_id) ?? init(c.user_id);
      r.total_checkins += 1;
      if (c.is_geofence_valid) r.valid_geofence += 1;
      byUser.set(c.user_id, r);
    }
    for (const v of visits ?? []) {
      const r = byUser.get(v.user_id) ?? init(v.user_id);
      r.total_visits += 1;
      if (v.is_low_quality) r.low_quality_visits += 1;
      byUser.set(v.user_id, r);
    }

    // 4-week trend: per-week buckets for last 4 weeks
    const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; };
    const weeks: string[] = [];
    for (let i = 3; i >= 0; i--) {
      const w = weekStart(new Date(Date.now() - i * 7 * 86400_000));
      weeks.push(w.toISOString().slice(0,10));
    }
    for (const [uid, r] of byUser) {
      const trend = weeks.map((w) => {
        const wStart = new Date(w).getTime();
        const wEnd = wStart + 7 * 86400_000;
        const ck = (checkins ?? []).filter((c: any) => c.user_id === uid && +new Date(c.checkin_time) >= wStart && +new Date(c.checkin_time) < wEnd);
        const vs = (visits ?? []).filter((v: any) => v.user_id === uid && +new Date(v.meeting_at) >= wStart && +new Date(v.meeting_at) < wEnd);
        return {
          week: w,
          geofence_rate: ck.length ? ck.filter((c: any) => c.is_geofence_valid).length / ck.length : 1,
          quality_rate: vs.length ? 1 - vs.filter((v: any) => v.is_low_quality).length / vs.length : 1,
        };
      });
      r.trend = trend;
      r.geofence_rate = r.total_checkins ? r.valid_geofence / r.total_checkins : 1;
      r.quality_rate = r.total_visits ? 1 - r.low_quality_visits / r.total_visits : 1;
      // severity: decline in last 2 weeks vs first 2 weeks (geofence + quality combined)
      const firstHalf = trend.slice(0, 2);
      const lastHalf = trend.slice(2);
      const avg = (a: { geofence_rate: number; quality_rate: number }[]) =>
        a.reduce((s, x) => s + (x.geofence_rate + x.quality_rate) / 2, 0) / Math.max(1, a.length);
      r.severity = Math.max(0, avg(firstHalf) - avg(lastHalf));
    }

    const rows = Array.from(byUser.values()).filter((r) => r.total_checkins + r.total_visits > 0);
    rows.sort((a, b) => b.severity - a.severity);
    return { rows };
  });

export const getMyIntegrityVisible = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase.from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
    if (!cm?.company_id) return { visible: false };
    const { data } = await supabase.from("visit_analytics_settings")
      .select("integrity_visible_to_reps").eq("company_id", cm.company_id).maybeSingle();
    return { visible: data?.integrity_visible_to_reps ?? false };
  });
