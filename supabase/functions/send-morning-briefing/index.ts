import { admin, sendWhatsApp, corsHeaders } from "../_shared/wati.ts";
import { requireCronOnly, unauthorized } from "../_shared/auth-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = requireCronOnly(req);
  if (!guard.ok) return unauthorized(corsHeaders, guard.reason);


  const sb = admin();
  // Today in Asia/Dhaka
  const tz = "Asia/Dhaka";
  const now = new Date();
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short",
  }).format(now);

  // Companies with morning briefing enabled
  const { data: settings } = await sb
    .from("whatsapp_settings")
    .select("company_id, morning_briefing_enabled, followup_threshold_days")
    .eq("morning_briefing_enabled", true);

  const companyIds = (settings ?? []).map((s) => s.company_id);
  if (!companyIds.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no enabled companies" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // All reps with whatsapp_number in those companies
  const { data: members } = await sb
    .from("company_members")
    .select("user_id, company_id, profiles!inner(id, full_name, whatsapp_number)")
    .in("company_id", companyIds);

  type Member = { user_id: string; company_id: string; profiles: { id: string; full_name: string | null; whatsapp_number: string | null } };
  const reps = ((members ?? []) as unknown as Member[]).filter((m) => m.profiles?.whatsapp_number);

  // Custom templates by company
  const { data: tpls } = await sb
    .from("whatsapp_templates")
    .select("company_id, key, body, enabled")
    .in("company_id", companyIds)
    .eq("key", "morning_briefing");
  const tplByCompany = new Map<string, { body: string; enabled: boolean }>();
  for (const t of tpls ?? []) tplByCompany.set(t.company_id, { body: t.body, enabled: t.enabled });

  const defaultTpl =
    "Good morning, {name}! 🌅\n*Today — {date}*\n📋 Tasks: {task_count} planned\n📍 Visits: {visit_count} scheduled\n🎯 Target: {achievement}% achieved this month\n⚠️ Follow-ups due: {followup_count}\n\nReply *MENU* for more options.";

  // Month range for target progress
  const monthStart = todayLocal.slice(0, 7) + "-01";

  let sent = 0; let failed = 0;
  for (const rep of reps) {
    const tpl = tplByCompany.get(rep.company_id);
    if (tpl && !tpl.enabled) continue;
    const body = tpl?.body ?? defaultTpl;

    const [tasksRes, visitsRes, followupsRes, leadsRes, targetRes] = await Promise.all([
      sb.from("tms_task_assignees").select("task_id, tms_tasks!inner(id, due_date, status_id, company_id, tms_task_statuses!inner(is_terminal))").eq("user_id", rep.user_id).eq("tms_tasks.due_date", todayLocal).eq("tms_tasks.company_id", rep.company_id),
      sb.from("customer_visits").select("id").eq("user_id", rep.user_id).eq("company_id", rep.company_id).gte("meeting_at", todayLocal + "T00:00:00").lt("meeting_at", todayLocal + "T23:59:59"),
      sb.from("followups").select("id").eq("rep_id", rep.user_id).eq("company_id", rep.company_id).in("status", ["pending", "snoozed"]),
      sb.from("crm_leads").select("expected_value").eq("assigned_to", rep.user_id).eq("company_id", rep.company_id).eq("stage", "won").gte("won_at", monthStart),
      sb.from("targets").select("target_value").eq("user_id", rep.user_id).eq("company_id", rep.company_id).eq("metric", "revenue").lte("period_start", todayLocal).gte("period_end", todayLocal).maybeSingle(),
    ]);

    const taskCount = tasksRes.data?.filter((t: { tms_tasks?: { tms_task_statuses?: { is_terminal?: boolean } } }) => !t.tms_tasks?.tms_task_statuses?.is_terminal).length ?? 0;
    const visitCount = visitsRes.data?.length ?? 0;
    const followupCount = followupsRes.data?.length ?? 0;
    const wonValue = (leadsRes.data ?? []).reduce((s: number, l: { expected_value: number | null }) => s + Number(l.expected_value ?? 0), 0);
    const targetValue = Number((targetRes.data as { target_value?: number } | null)?.target_value ?? 0);
    const achievement = targetValue > 0 ? Math.round((wonValue / targetValue) * 100) : 0;

    const filled = body
      .replace(/\{name\}/g, rep.profiles.full_name ?? "there")
      .replace(/\{date\}/g, dateLabel)
      .replace(/\{task_count\}/g, String(taskCount))
      .replace(/\{visit_count\}/g, String(visitCount))
      .replace(/\{achievement\}/g, String(achievement))
      .replace(/\{followup_count\}/g, String(followupCount));

    const r = await sendWhatsApp({
      phone: rep.profiles.whatsapp_number!,
      body: filled,
      companyId: rep.company_id,
      userId: rep.user_id,
      templateKey: "morning_briefing",
    });
    if (r.ok) sent++; else failed++;
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, total: reps.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
