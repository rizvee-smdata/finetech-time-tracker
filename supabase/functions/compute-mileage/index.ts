// Compute total kilometers driven today from a user's check-in coordinates (Haversine sum)
// and upsert daily_routes. Called from the client after each checkout.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { date } = await req.json().catch(() => ({ date: null }));
    const day: string = date ?? new Date().toISOString().slice(0, 10);

    // Fetch all check-ins (and checkouts) for this user that day, ordered chronologically
    const { data: checkins, error } = await supabase
      .from("visit_checkins")
      .select("checkin_lat, checkin_lng, checkout_lat, checkout_lng, checkin_time, checkout_time, company_id")
      .eq("user_id", user.id)
      .gte("checkin_time", `${day}T00:00:00`)
      .lte("checkin_time", `${day}T23:59:59`)
      .order("checkin_time");
    if (error) throw error;

    // Build chronological waypoint list (check-in, then checkout if any)
    type P = { lat: number; lng: number; t: string };
    const pts: P[] = [];
    for (const c of checkins ?? []) {
      pts.push({ lat: c.checkin_lat, lng: c.checkin_lng, t: c.checkin_time });
      if (c.checkout_lat != null && c.checkout_lng != null && c.checkout_time) {
        pts.push({ lat: c.checkout_lat, lng: c.checkout_lng, t: c.checkout_time });
      }
    }
    pts.sort((a, b) => a.t.localeCompare(b.t));

    let totalM = 0;
    for (let i = 1; i < pts.length; i++) totalM += haversineMeters(pts[i - 1], pts[i]);
    const totalKm = Number((totalM / 1000).toFixed(3));
    const visitCount = (checkins ?? []).length;
    const companyId = checkins?.[0]?.company_id;

    if (!companyId) {
      return new Response(JSON.stringify({ total_km: 0, visit_count: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: upErr } = await supabase.from("daily_routes").upsert({
      user_id: user.id, company_id: companyId, route_date: day,
      total_km: totalKm, visit_count: visitCount,
    }, { onConflict: "user_id,route_date" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ total_km: totalKm, visit_count: visitCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
