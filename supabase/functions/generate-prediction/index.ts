// AI Target Achievement Predictor — generates a month-end revenue forecast
// for a single sales rep using Lovable AI Gateway (Gemini).
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

function dhakaToday() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
}

function monthRange(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const toIso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: toIso(start), end: toIso(end), startD: start, endD: end };
}

// Friday weekend in Bangladesh (Sat = working). We count Sun-Thu + Sat = 6 working days.
// To keep it simple: working day = not Friday.
function workingDaysBetween(from: Date, to: Date) {
  let count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    if (cur.getDay() !== 5) count++; // skip Friday
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const predictionTool = {
  type: "function" as const,
  function: {
    name: "submit_prediction",
    description: "Return the month-end revenue forecast for the sales rep.",
    parameters: {
      type: "object",
      properties: {
        predicted_revenue: { type: "number", description: "Most likely month-end revenue in BDT" },
        best_case: { type: "number", description: "Optimistic scenario (~+20%)" },
        worst_case: { type: "number", description: "Pessimistic scenario (~-20%)" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        gap_to_target: { type: "number", description: "Target minus predicted, in BDT (can be negative if above target)" },
        required_additional_visits: { type: "integer", minimum: 0 },
        required_additional_proposals: { type: "integer", minimum: 0 },
        key_driver: { type: "string", description: "Main positive factor" },
        risk_factor: { type: "string", description: "Main risk" },
        recommendation: { type: "string", description: "One actionable sentence" },
      },
      required: [
        "predicted_revenue", "best_case", "worst_case", "confidence",
        "gap_to_target", "required_additional_visits", "required_additional_proposals",
        "key_driver", "risk_factor", "recommendation",
      ],
    },
  },
};

const SYSTEM = `You are a sales forecasting AI for B2B reps in Bangladesh. Given a rep's monthly performance snapshot, predict month-end revenue achievement. Base currency BDT. Be realistic: weight historical close rate and the time remaining in the month. Call the submit_prediction tool exactly once. No prose.`;

interface RepInputs {
  rep_id: string;
  rep_name: string;
  target_value: number;
  achieved_so_far: number;
  open_pipeline_weighted: number;
  days_elapsed: number;
  total_working_days: number;
  ratio_elapsed: number;
  historical_close_rate_per_day: number;
  visits_this_month: number;
  historical_visits_per_day: number;
  open_deals_count: number;
  avg_deal_size: number;
}

async function computeInputs(admin: ReturnType<typeof createClient>, companyId: string, userId: string) {
  const today = dhakaToday();
  const { start, end, startD, endD } = monthRange(today);

  // Target (monthly revenue, scope=user, current month)
  const { data: target } = await admin
    .from("targets")
    .select("target_value")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("metric", "revenue")
    .lte("period_start", end)
    .gte("period_end", start)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const target_value = Number(target?.target_value ?? 0);

  // Won this month
  const { data: wonRows } = await admin
    .from("crm_leads")
    .select("expected_value")
    .eq("company_id", companyId)
    .eq("assigned_to", userId)
    .eq("stage", "won")
    .gte("won_at", `${start}T00:00:00`)
    .lte("won_at", `${end}T23:59:59`);
  const achieved_so_far = (wonRows ?? []).reduce((s: number, r: any) => s + Number(r.expected_value ?? 0), 0);

  // Open pipeline (deals expected to close this month)
  const { data: openRows } = await admin
    .from("crm_leads")
    .select("expected_value, probability, expected_close_date, stage, customer_name, company_name")
    .eq("company_id", companyId)
    .eq("assigned_to", userId)
    .not("stage", "in", "(won,lost)")
    .gte("expected_close_date", start)
    .lte("expected_close_date", end);
  const open_pipeline_weighted = (openRows ?? []).reduce(
    (s: number, r: any) => s + Number(r.expected_value ?? 0) * (Number(r.probability ?? 0) / 100),
    0,
  );
  const open_deals_count = (openRows ?? []).length;
  const avg_deal_size = open_deals_count > 0
    ? (openRows ?? []).reduce((s: number, r: any) => s + Number(r.expected_value ?? 0), 0) / open_deals_count
    : 0;

  // Days elapsed
  const elapsedEnd = today < endD ? today : endD;
  const days_elapsed = Math.max(1, workingDaysBetween(startD, elapsedEnd));
  const total_working_days = Math.max(days_elapsed, workingDaysBetween(startD, endD));
  const ratio_elapsed = days_elapsed / total_working_days;

  // Historical close rate (last 3 months)
  const histStart = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const histEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const histStartIso = histStart.toISOString().slice(0, 10);
  const histEndIso = histEnd.toISOString().slice(0, 10);
  const { data: histWon } = await admin
    .from("crm_leads")
    .select("expected_value, won_at")
    .eq("company_id", companyId)
    .eq("assigned_to", userId)
    .eq("stage", "won")
    .gte("won_at", `${histStartIso}T00:00:00`)
    .lte("won_at", `${histEndIso}T23:59:59`);
  const histRevenue = (histWon ?? []).reduce((s: number, r: any) => s + Number(r.expected_value ?? 0), 0);
  const histWorkingDays = Math.max(1, workingDaysBetween(histStart, histEnd));
  const historical_close_rate_per_day = histRevenue / histWorkingDays;

  // Visits this month
  const { count: visitsCount } = await admin
    .from("customer_visits")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .gte("meeting_at", `${start}T00:00:00`)
    .lte("meeting_at", `${end}T23:59:59`);
  const visits_this_month = visitsCount ?? 0;

  // Historical visits per day
  const { count: histVisits } = await admin
    .from("customer_visits")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .gte("meeting_at", `${histStartIso}T00:00:00`)
    .lte("meeting_at", `${histEndIso}T23:59:59`);
  const historical_visits_per_day = (histVisits ?? 0) / histWorkingDays;

  // Rep name
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();

  const inputs: RepInputs = {
    rep_id: userId,
    rep_name: (profile as any)?.full_name ?? "Rep",
    target_value,
    achieved_so_far,
    open_pipeline_weighted,
    days_elapsed,
    total_working_days,
    ratio_elapsed,
    historical_close_rate_per_day,
    visits_this_month,
    historical_visits_per_day,
    open_deals_count,
    avg_deal_size,
  };

  return { inputs, periodStart: start, periodEnd: end };
}

async function callAi(inputs: RepInputs, lovableKey: string) {
  const userPrompt = `Sales rep performance snapshot (current month):\n${JSON.stringify(inputs, null, 2)}\n\nForecast month-end revenue (BDT). Consider time elapsed, historical close rate, weighted open pipeline, and visit pace. Return tool call only.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      tools: [predictionTool],
      tool_choice: { type: "function", function: { name: "submit_prediction" } },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json();
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc?.function?.arguments) throw new Error("AI did not return a tool call");
  return JSON.parse(tc.function.arguments) as {
    predicted_revenue: number; best_case: number; worst_case: number; confidence: number;
    gap_to_target: number; required_additional_visits: number; required_additional_proposals: number;
    key_driver: string; risk_factor: string; recommendation: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json(401, { error: "Missing Authorization header" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json(401, { error: "Invalid session" });
    const callerId = userRes.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      rep_id?: string; company_id?: string; force?: boolean;
    };

    const admin = createClient(supabaseUrl, serviceKey);

    let companyId = body.company_id ?? null;
    if (!companyId) {
      const { data: m } = await admin
        .from("company_members").select("company_id")
        .eq("user_id", callerId).limit(1).maybeSingle();
      companyId = (m as any)?.company_id ?? null;
    }
    if (!companyId) return json(400, { error: "company_id required" });

    const repId = body.rep_id ?? callerId;
    if (repId !== callerId) {
      const { data: isStaffRow } = await admin.rpc("is_staff", { _user_id: callerId });
      if (!isStaffRow) return json(403, { error: "Not authorized" });
    }

    // Rate limit: max 3 per day per rep unless force
    const dhakaDate = dhakaToday().toISOString().slice(0, 10);
    const { data: todayRuns } = await admin
      .from("prediction_runs")
      .select("id, generated_at")
      .eq("user_id", repId)
      .eq("run_date", dhakaDate);
    if ((todayRuns ?? []).length >= 3 && !body.force) {
      return json(429, { error: "Daily prediction limit reached (3/day). Try again tomorrow." });
    }

    const { inputs, periodStart, periodEnd } = await computeInputs(admin, companyId, repId);

    if (inputs.target_value <= 0) {
      return json(400, { error: "No monthly revenue target set for this rep." });
    }

    const ai = await callAi(inputs, lovableKey);
    const achievement_pct = inputs.target_value > 0
      ? Math.round((Number(ai.predicted_revenue) / inputs.target_value) * 100)
      : 0;

    const row = {
      company_id: companyId,
      user_id: repId,
      period_start: periodStart,
      period_end: periodEnd,
      run_date: dhakaDate,
      inputs: inputs as unknown as Record<string, unknown>,
      predicted_revenue: ai.predicted_revenue,
      best_case: ai.best_case,
      worst_case: ai.worst_case,
      confidence: ai.confidence,
      gap_to_target: ai.gap_to_target,
      required_additional_visits: ai.required_additional_visits,
      required_additional_proposals: ai.required_additional_proposals,
      key_driver: ai.key_driver,
      risk_factor: ai.risk_factor,
      recommendation: ai.recommendation,
      target_value: inputs.target_value,
      achieved_value: inputs.achieved_so_far,
      achievement_pct,
      model: "google/gemini-2.5-flash",
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await admin
      .from("prediction_runs")
      .upsert(row, { onConflict: "user_id,run_date" })
      .select()
      .single();
    if (upErr) return json(500, { error: upErr.message });

    return json(200, { prediction: saved });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
