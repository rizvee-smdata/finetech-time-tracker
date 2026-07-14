import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  from: z.string(), // yyyy-mm-dd
  to: z.string(),
  repId: z.string().uuid().nullable().optional(),
});

export type AuditAnomaly = {
  kind:
    | "geofence_override"
    | "missing_selfie"
    | "short_visit"
    | "impossible_speed"
    | "duplicate_location"
    | "no_checkout"
    | "spoof_suspect";
  severity: "low" | "medium" | "high";
  message: string;
  metadata?: Record<string, number | string | boolean | null>;
};

export type AuditCheckin = {
  id: string;
  user_id: string;
  rep_name: string;
  client_name: string | null;
  checkin_time: string;
  checkout_time: string | null;
  duration_minutes: number | null;
  checkin_lat: number;
  checkin_lng: number;
  checkout_lat: number | null;
  checkout_lng: number | null;
  distance_from_client_m: number | null;
  is_geofence_valid: boolean;
  selfie_url: string | null;
  notes: string | null;
  anomalies: AuditAnomaly[];
};

export type AuditRepSummary = {
  user_id: string;
  rep_name: string;
  total_checkins: number;
  total_anomalies: number;
  high_severity: number;
  geofence_overrides: number;
  missing_selfies: number;
  short_visits: number;
  impossible_speeds: number;
  km_driven: number;
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const getGpsAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Staff gate
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "manager");
    if (!isStaff) throw new Error("Forbidden");

    const { data: cm } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const companyId = cm?.company_id;
    if (!companyId)
      return { checkins: [] as AuditCheckin[], reps: [] as AuditRepSummary[] };

    const fromIso = `${data.from}T00:00:00`;
    const toIso = `${data.to}T23:59:59`;

    let q = supabase
      .from("visit_checkins")
      .select(
        "id, user_id, client_name, checkin_time, checkout_time, checkin_lat, checkin_lng, checkout_lat, checkout_lng, distance_from_client_m, is_geofence_valid, selfie_url, notes",
      )
      .eq("company_id", companyId)
      .gte("checkin_time", fromIso)
      .lte("checkin_time", toIso)
      .order("checkin_time");
    if (data.repId) q = q.eq("user_id", data.repId);
    const { data: rows } = await q;
    const checkins = (rows ?? []) as any[];

    const userIds = Array.from(new Set(checkins.map((c) => c.user_id)));
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.full_name ?? p.email ?? "Rep"]));

    // Group per user chronologically for cross-checkin anomalies
    const byUser = new Map<string, any[]>();
    for (const c of checkins) {
      if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
      byUser.get(c.user_id)!.push(c);
    }

    const enriched: AuditCheckin[] = [];
    const kmByUser = new Map<string, number>();

    for (const [uid, list] of byUser) {
      list.sort((a, b) => a.checkin_time.localeCompare(b.checkin_time));
      let kmSum = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const anomalies: AuditAnomaly[] = [];
        const dur =
          c.checkout_time
            ? Math.max(
                0,
                Math.round(
                  (new Date(c.checkout_time).getTime() -
                    new Date(c.checkin_time).getTime()) /
                    60000,
                ),
              )
            : null;

        if (!c.is_geofence_valid) {
          anomalies.push({
            kind: "geofence_override",
            severity: "high",
            message: `Checked in ${c.distance_from_client_m ? Math.round(c.distance_from_client_m) + " m" : "outside"} the geofence.`,
            metadata: { distance_m: c.distance_from_client_m ?? null },
          });
        }
        if (!c.selfie_url) {
          anomalies.push({
            kind: "missing_selfie",
            severity: "medium",
            message: "No selfie captured at check-in.",
          });
        }
        if (dur != null && dur > 0 && dur < 3) {
          anomalies.push({
            kind: "short_visit",
            severity: "medium",
            message: `Visit lasted only ${dur} min.`,
            metadata: { minutes: dur },
          });
        }
        if (!c.checkout_time) {
          const openHours = (Date.now() - new Date(c.checkin_time).getTime()) / 3600000;
          if (openHours > 8) {
            anomalies.push({
              kind: "no_checkout",
              severity: "medium",
              message: `Open for ${openHours.toFixed(1)} h — never checked out.`,
              metadata: { hours: Number(openHours.toFixed(1)) },
            });
          }
        }

        // Cross-checkin anomalies
        if (i > 0) {
          const prev = list[i - 1];
          const prevPos =
            prev.checkout_lat != null && prev.checkout_lng != null
              ? { lat: prev.checkout_lat, lng: prev.checkout_lng }
              : { lat: prev.checkin_lat, lng: prev.checkin_lng };
          const curPos = { lat: c.checkin_lat, lng: c.checkin_lng };
          const distM = haversineM(prevPos, curPos);
          kmSum += distM / 1000;
          const prevTime = new Date(prev.checkout_time ?? prev.checkin_time).getTime();
          const gapH = (new Date(c.checkin_time).getTime() - prevTime) / 3600000;
          if (gapH > 0 && distM > 500) {
            const kmh = distM / 1000 / gapH;
            if (kmh > 120) {
              anomalies.push({
                kind: "impossible_speed",
                severity: "high",
                message: `Traveled ${(distM / 1000).toFixed(1)} km in ${(gapH * 60).toFixed(0)} min (${kmh.toFixed(0)} km/h).`,
                metadata: { km: Number((distM / 1000).toFixed(2)), kmh: Number(kmh.toFixed(0)) },
              });
            }
          }
          if (distM < 25 && prev.client_name !== c.client_name) {
            anomalies.push({
              kind: "duplicate_location",
              severity: "low",
              message: `Same GPS point as previous check-in (${prev.client_name ?? "prev"}).`,
            });
          }
          // Spoof suspect: exact same coordinates
          if (
            Math.abs(prevPos.lat - curPos.lat) < 1e-6 &&
            Math.abs(prevPos.lng - curPos.lng) < 1e-6
          ) {
            anomalies.push({
              kind: "spoof_suspect",
              severity: "medium",
              message: "Identical coordinates to previous check-in — possible mock location.",
            });
          }
        }

        enriched.push({
          id: c.id,
          user_id: c.user_id,
          rep_name: nameOf.get(c.user_id) ?? "Rep",
          client_name: c.client_name,
          checkin_time: c.checkin_time,
          checkout_time: c.checkout_time,
          duration_minutes: dur,
          checkin_lat: c.checkin_lat,
          checkin_lng: c.checkin_lng,
          checkout_lat: c.checkout_lat,
          checkout_lng: c.checkout_lng,
          distance_from_client_m: c.distance_from_client_m,
          is_geofence_valid: c.is_geofence_valid,
          selfie_url: c.selfie_url,
          notes: c.notes,
          anomalies,
        });
      }
      kmByUser.set(uid, kmSum);
    }

    // Rep summaries
    const reps: AuditRepSummary[] = Array.from(byUser.keys()).map((uid) => {
      const list = enriched.filter((c) => c.user_id === uid);
      const flat = list.flatMap((c) => c.anomalies);
      return {
        user_id: uid,
        rep_name: nameOf.get(uid) ?? "Rep",
        total_checkins: list.length,
        total_anomalies: flat.length,
        high_severity: flat.filter((a) => a.severity === "high").length,
        geofence_overrides: flat.filter((a) => a.kind === "geofence_override").length,
        missing_selfies: flat.filter((a) => a.kind === "missing_selfie").length,
        short_visits: flat.filter((a) => a.kind === "short_visit").length,
        impossible_speeds: flat.filter((a) => a.kind === "impossible_speed").length,
        km_driven: Number((kmByUser.get(uid) ?? 0).toFixed(1)),
      };
    });
    reps.sort((a, b) => b.high_severity - a.high_severity || b.total_anomalies - a.total_anomalies);

    // Sort checkins by time desc for display
    enriched.sort((a, b) => b.checkin_time.localeCompare(a.checkin_time));

    return { checkins: enriched, reps };
  });

export const listAuditReps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: cm } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!cm?.company_id) return { reps: [] as { id: string; name: string }[] };
    const { data: members } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("company_id", cm.company_id);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (!ids.length) return { reps: [] };
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return {
      reps: (profs ?? []).map((p: any) => ({
        id: p.id,
        name: p.full_name ?? p.email ?? "Rep",
      })),
    };
  });
