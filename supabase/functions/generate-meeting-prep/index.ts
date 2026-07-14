// AI Meeting Preparation — generates a pre-visit briefing for a client-visit task.
// Aggregates last 5 visits, open deals, pending follow-ups, last 10 CRM interactions,
// client profile, and NPS/survey responses, then calls Lovable AI (Gemini) to produce
// a structured briefing stored on public.meeting_prep_briefs.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCronOrUser, unauthorized } from "../_shared/auth-guard.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const briefTool = {
  type: "function" as const,
  function: {
    name: "submit_meeting_brief",
    description: "Return a pre-visit meeting briefing.",
    parameters: {
      type: "object",
      properties: {
        snapshot_summary: { type: "string", description: "3 sentences — what matters most right now." },
        open_items: { type: "array", items: { type: "string" }, description: "Pending issues / commitments." },
        suggested_questions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
        talking_points: { type: "array", items: { type: "object", properties: { title: { type: "string" }, rationale: { type: "string" } }, required: ["title", "rationale"] }, minItems: 2, maxItems: 4 },
        risk_flags: { type: "array", items: { type: "string" } },
        relationship_health: { type: "string", enum: ["warm", "neutral", "cold"] },
        one_key_priority: { type: "string", description: "Single most important objective for this meeting." },
      },
      required: ["snapshot_summary", "open_items", "suggested_questions", "talking_points", "risk_flags", "relationship_health", "one_key_priority"],
    },
  },
};

const SYSTEM = `You are a meeting preparation AI for a B2B sales team in Bangladesh. Create a pre-visit briefing for a sales rep. Be specific, practical, and concise. Currency BDT. Tailor questions and talking points to this client's actual situation. Call submit_meeting_brief exactly once. No prose.`;

async function aggregate(admin: ReturnType<typeof createClient>, taskId: string) {
  const { data: task, error: taskErr } = await admin
    .from("tms_tasks")
    .select("id, company_id, title, description, category, scheduled_date, scheduled_time, lead_id, created_by")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) throw new Error(`Task not found: ${taskErr?.message ?? taskId}`);

  let lead: any = null;
  let account: any = null;
  if (task.lead_id) {
    const { data: l } = await admin.from("crm_leads").select("*").eq("id", task.lead_id).maybeSingle();
    lead = l;
    if (l?.account_id) {
      const { data: a } = await admin.from("crm_accounts").select("*").eq("id", l.account_id).maybeSingle();
      account = a;
    }
  }

  const repId = task.created_by;
  const companyId = task.company_id;

  // Last 5 visits for this client (by lead's customer_name + company_name match or by lead's assigned rep)
  const clientName = lead?.customer_name ?? null;
  const clientCompany = lead?.company_name ?? null;

  let visitsQ = admin
    .from("customer_visits")
    .select("id, meeting_at, customer_name, company, discussion_summary, ai_summary, ai_action_items, ai_sentiment, next_action, next_meeting_at")
    .eq("company_id", companyId)
    .order("meeting_at", { ascending: false })
    .limit(5);
  if (clientName) visitsQ = visitsQ.ilike("customer_name", `%${clientName}%`);
  const { data: visits } = await visitsQ;

  // Open deals for this client (by account or by name match)
  let dealsQ = admin
    .from("crm_leads")
    .select("id, customer_name, company_name, stage, expected_value, currency, probability, expected_close_date, last_activity_at, notes")
    .eq("company_id", companyId)
    .not("stage", "in", "(won,lost)")
    .order("last_activity_at", { ascending: false })
    .limit(10);
  if (lead?.account_id) dealsQ = dealsQ.eq("account_id", lead.account_id);
  else if (clientCompany) dealsQ = dealsQ.ilike("company_name", `%${clientCompany}%`);
  const { data: openDeals } = await dealsQ;

  // Pending follow-up tasks for this client (by lead_id)
  const { data: pendingTasks } = lead?.id
    ? await admin
        .from("tms_tasks")
        .select("id, title, description, scheduled_date, scheduled_time, priority, status_id")
        .eq("company_id", companyId)
        .eq("lead_id", lead.id)
        .is("completed_at", null)
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(10)
    : { data: [] as any[] };

  // Last 10 CRM interactions on this lead
  const { data: activities } = lead?.id
    ? await admin
        .from("crm_lead_activities")
        .select("activity_type, title, body, occurred_at, metadata")
        .eq("lead_id", lead.id)
        .order("occurred_at", { ascending: false })
        .limit(10)
    : { data: [] as any[] };

  // NPS / survey responses
  const { data: nps } = lead?.id
    ? await admin
        .from("survey_responses")
        .select("rating, sentiment, notes, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as any[] };

  // Rep info
  const { data: rep } = repId
    ? await admin.from("profiles").select("full_name, email, phone").eq("id", repId).maybeSingle()
    : { data: null };

  return {
    task,
    lead,
    account,
    rep,
    rep_id: repId,
    company_id: companyId,
    visits: visits ?? [],
    open_deals: openDeals ?? [],
    pending_tasks: pendingTasks ?? [],
    activities: activities ?? [],
    nps: nps ?? [],
  };
}

async function callAi(payload: unknown, lovableKey: string) {
  const userPrompt = `Aggregated client context for the upcoming visit:\n${JSON.stringify(payload, null, 2)}\n\nProduce a focused pre-visit brief tailored to this client's situation. Return tool call only.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      tools: [briefTool],
      tool_choice: { type: "function", function: { name: "submit_meeting_brief" } },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json();
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc?.function?.arguments) throw new Error("AI did not return a tool call");
  return JSON.parse(tc.function.arguments);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const guard = await requireCronOrUser(req);
  if (!guard.ok) return unauthorized(corsHeaders, guard.reason);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json(500, { error: "LOVABLE_API_KEY not configured" });
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const taskId = body?.task_id ?? body?.visit_task_id;
    const force = body?.force === true;
    if (!taskId) return json(400, { error: "task_id required" });


    // Skip if a brief already exists and not forcing
    const { data: existing } = await admin
      .from("meeting_prep_briefs")
      .select("id, status, brief")
      .eq("task_id", taskId)
      .maybeSingle();
    if (existing && existing.status === "ready" && !force) {
      return json(200, { brief_id: existing.id, brief: existing.brief, cached: true });
    }

    const agg = await aggregate(admin, taskId);
    if (!agg.rep_id) return json(400, { error: "Task has no creator (rep)" });

    // Upsert pending row
    const { data: row, error: rowErr } = await admin
      .from("meeting_prep_briefs")
      .upsert({
        task_id: taskId,
        company_id: agg.company_id,
        lead_id: agg.lead?.id ?? null,
        account_id: agg.account?.id ?? null,
        rep_id: agg.rep_id,
        scheduled_at: agg.task.scheduled_date
          ? `${agg.task.scheduled_date}T${agg.task.scheduled_time ?? "09:00:00"}`
          : null,
        status: "pending",
        aggregated_data: agg as any,
      }, { onConflict: "task_id" })
      .select("id")
      .single();
    if (rowErr) throw new Error(`Upsert failed: ${rowErr.message}`);

    try {
      const brief = await callAi(agg, lovableKey);
      await admin
        .from("meeting_prep_briefs")
        .update({ status: "ready", brief, generated_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      return json(200, { brief_id: row.id, brief });
    } catch (e: any) {
      await admin
        .from("meeting_prep_briefs")
        .update({ status: "failed", error: String(e?.message ?? e) })
        .eq("id", row.id);
      throw e;
    }
  } catch (e: any) {
    console.error("[generate-meeting-prep]", e);
    return json(500, { error: String(e?.message ?? e) });
  }
});
