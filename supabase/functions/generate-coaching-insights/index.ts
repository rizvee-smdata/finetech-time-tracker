// Generate weekly AI Sales Coach insights via Anthropic Claude.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function startOfWeek(d = new Date()) {
  // Monday as start of ISO week, Asia/Dhaka
  const dhaka = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  const day = dhaka.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7; // back to Monday
  dhaka.setDate(dhaka.getDate() - diff);
  dhaka.setHours(0, 0, 0, 0);
  return dhaka.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return json(500, { error: "ANTHROPIC_API_KEY not configured" });

    // Auth-bound client (to identify the caller)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json(401, { error: "Invalid session" });
    const callerId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      rep_id?: string;
      company_id?: string;
      force?: boolean;
    };

    // Admin client for elevated reads/writes
    const admin = createClient(supabaseUrl, serviceKey);

    // Determine company + target rep
    let companyId = body.company_id ?? null;
    if (!companyId) {
      const { data: m } = await admin
        .from("company_members")
        .select("company_id")
        .eq("user_id", callerId)
        .limit(1)
        .maybeSingle();
      companyId = m?.company_id ?? null;
    }
    if (!companyId) return json(400, { error: "company_id required" });

    const repId = body.rep_id ?? callerId;

    // If caller is not the rep, ensure they are staff of that company
    if (repId !== callerId) {
      const { data: isStaffRow } = await admin.rpc("is_staff", { _user_id: callerId });
      if (!isStaffRow) return json(403, { error: "Not authorized" });
    }

    const weekStart = startOfWeek();

    // Rate limit: once per 24h per rep+week
    const { data: existing } = await admin
      .from("coaching_insights")
      .select("id, generated_at")
      .eq("user_id", repId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing && !body.force) {
      const ageMs = Date.now() - new Date(existing.generated_at as string).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return json(429, {
          error: "Already generated today. Try again tomorrow.",
          existing_id: existing.id,
        });
      }
    }

    // Aggregate last 28 days
    const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: wonDeals = [] },
      { data: lostDeals = [] },
      { data: visits = [] },
      { data: tasks = [] },
      { data: activities = [] },
      { data: profile },
      { data: teamWon = [] },
      { data: teamVisits = [] },
    ] = await Promise.all([
      admin.from("crm_leads").select("id, customer_name, company_name, expected_value, currency, won_at, products, industry")
        .eq("assigned_to", repId).eq("company_id", companyId).eq("stage", "won").gte("won_at", since),
      admin.from("crm_leads").select("id, customer_name, lost_at, industry")
        .eq("assigned_to", repId).eq("company_id", companyId).eq("stage", "lost").gte("lost_at", since),
      admin.from("visit_checkins").select("id, checkin_time, client_name")
        .eq("user_id", repId).eq("company_id", companyId).gte("checkin_time", since),
      admin.from("tms_tasks").select("id, status_id, due_date, completed_at, created_at")
        .eq("company_id", companyId).gte("created_at", since)
        .contains("assignee_ids" as never, [repId] as never).limit(200) as never,
      admin.from("crm_lead_activities").select("id, activity_type, occurred_at")
        .eq("user_id", repId).gte("occurred_at", since),
      admin.from("profiles").select("full_name").eq("id", repId).maybeSingle(),
      admin.from("crm_leads").select("assigned_to, expected_value")
        .eq("company_id", companyId).eq("stage", "won").gte("won_at", since),
      admin.from("visit_checkins").select("user_id").eq("company_id", companyId).gte("checkin_time", since),
    ]);

    // Day-of-week win pattern
    const dowNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const dowCounts = Array(7).fill(0);
    for (const d of wonDeals as any[]) {
      if (d.won_at) dowCounts[new Date(d.won_at).getDay()]++;
    }
    const bestDayIdx = dowCounts.indexOf(Math.max(...dowCounts));

    const totalWon = (wonDeals as any[]).length;
    const totalLost = (lostDeals as any[]).length;
    const closeRate = totalWon + totalLost > 0 ? Math.round((totalWon / (totalWon + totalLost)) * 100) : 0;
    const visitCount = (visits as any[]).length;
    const revenue = (wonDeals as any[]).reduce((s, d) => s + Number(d.expected_value || 0), 0);

    // Team benchmark
    const teamReps = new Set((teamWon as any[]).map((r) => r.assigned_to));
    const teamRepCount = Math.max(1, teamReps.size);
    const teamRevenueAvg = (teamWon as any[]).reduce((s, d) => s + Number(d.expected_value || 0), 0) / teamRepCount;
    const visitRepCounts = new Map<string, number>();
    for (const v of teamVisits as any[]) {
      visitRepCounts.set(v.user_id, (visitRepCounts.get(v.user_id) ?? 0) + 1);
    }
    const teamVisitAvg = visitRepCounts.size > 0
      ? Array.from(visitRepCounts.values()).reduce((a, b) => a + b, 0) / visitRepCounts.size
      : 0;

    const calls = (activities as any[]).filter((a) => a.activity_type === "call").length;
    const emails = (activities as any[]).filter((a) => ["email","note"].includes(a.activity_type)).length;

    // Streak: consecutive days with a visit ending today
    const visitDays = new Set((visits as any[]).map((v: any) => String(v.checkin_time).slice(0, 10)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (visitDays.has(d.toISOString().slice(0, 10))) streak++; else break;
    }

    const snapshot = {
      rep_name: profile?.full_name ?? "the rep",
      window_days: 28,
      revenue, deals_won: totalWon, deals_lost: totalLost, close_rate_pct: closeRate,
      visits: visitCount, calls, emails,
      best_day: dowNames[bestDayIdx], best_day_count: dowCounts[bestDayIdx],
      day_distribution: Object.fromEntries(dowNames.map((n, i) => [n, dowCounts[i]])),
      team_revenue_avg: Math.round(teamRevenueAvg),
      team_visit_avg: Math.round(teamVisitAvg),
      consecutive_visit_days: streak,
      top_industries: Array.from(new Set((wonDeals as any[]).map((d) => d.industry).filter(Boolean))).slice(0, 5),
    };

    const system = `You are an expert B2B sales coach for a technology distributor in Bangladesh. Analyze this rep's performance data and provide personalized, actionable coaching. Be specific, data-driven, encouraging but honest. Output ONLY valid JSON (no prose, no markdown fences) with keys: strength (string, with concrete numbers from the data), focus_area (string, biggest gap vs team avg or target with context), win_pattern (string, days/products/client types where they shine), actions (array of exactly 3 specific numbered strings starting with a verb), engagement_score (integer 1-10 based on activity consistency), motivational_message (string, 1-2 warm sentences).`;

    const userPrompt = `Rep performance snapshot (last 28 days):\n${JSON.stringify(snapshot, null, 2)}\n\nCompare against team_revenue_avg and team_visit_avg. Cite specific numbers. Output JSON only.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return json(502, { error: `Claude API ${aiRes.status}: ${txt.slice(0, 500)}` });
    }
    const aiData = await aiRes.json();
    const text: string = aiData?.content?.[0]?.text ?? "";
    let parsed: any = null;
    try { parsed = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* noop */ } }
    }
    if (!parsed) return json(502, { error: "Could not parse AI JSON", raw: text.slice(0, 500) });

    const score = Math.max(1, Math.min(10, Number(parsed.engagement_score) || 5));
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3).map(String) : [];

    const row = {
      company_id: companyId,
      user_id: repId,
      week_start: weekStart,
      strength: String(parsed.strength ?? ""),
      focus_area: String(parsed.focus_area ?? ""),
      win_pattern: String(parsed.win_pattern ?? ""),
      actions,
      engagement_score: score,
      motivational_message: String(parsed.motivational_message ?? ""),
      evidence: { close_rate_pct: closeRate, best_day: snapshot.best_day, visits: visitCount, revenue, streak },
      data_snapshot: snapshot,
      model: "claude-sonnet-4-20250514",
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await admin
      .from("coaching_insights")
      .upsert(row, { onConflict: "user_id,week_start" })
      .select()
      .single();

    if (upErr) return json(500, { error: upErr.message });

    return json(200, { insight: saved });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
