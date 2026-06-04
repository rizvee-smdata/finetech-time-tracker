// Inbound webhook from WATI. Verifies shared secret in `x-wati-secret` header.
import { admin, sendWhatsApp, logInbound, normalisePhone, corsHeaders } from "../_shared/wati.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const expected = Deno.env.get("WATI_WEBHOOK_SECRET");
  const provided = req.headers.get("x-wati-secret");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sb = admin();
  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;

  // WATI payload shape (approximate): { eventType, waId, text, type, data: { mediaUrl }, messageId }
  const phone = normalisePhone(String(payload.waId ?? payload.from ?? "")) ?? "";
  const text = String(payload.text ?? payload.body ?? "").trim();
  const mediaUrl = (payload.data as { mediaUrl?: string } | undefined)?.mediaUrl ?? null;
  const messageType = String(payload.type ?? "text");
  const watiMessageId = (payload.messageId as string | undefined) ?? null;

  if (!phone) return new Response(JSON.stringify({ ok: true, skipped: "no phone" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Resolve sender
  const { data: profile } = await sb.from("profiles").select("id, full_name, whatsapp_number").eq("whatsapp_number", phone).maybeSingle();
  const userId = profile?.id ?? null;
  const { data: memberships } = userId
    ? await sb.from("company_members").select("company_id").eq("user_id", userId).limit(1)
    : { data: [] };
  const companyId = memberships?.[0]?.company_id ?? null;

  await logInbound({ companyId, userId, phone, body: text, messageType, mediaUrl, watiMessageId, metadata: payload });

  if (!userId) {
    await sendWhatsApp({ phone, body: "Sorry, this WhatsApp number isn't linked to a Lavisho account. Please contact your admin.", companyId: null });
    return new Response(JSON.stringify({ ok: true, response: "unknown sender" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Settings & role
  const { data: settings } = companyId
    ? await sb.from("whatsapp_settings").select("inbound_commands_enabled, expense_capture_enabled").eq("company_id", companyId).maybeSingle()
    : { data: null };
  if (settings && !settings.inbound_commands_enabled) {
    return new Response(JSON.stringify({ ok: true, response: "commands disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const isManager = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "manager");

  const upper = text.toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  // EXPENSE capture: image + text "expense"
  if (mediaUrl && upper.includes("EXPENSE") && settings?.expense_capture_enabled !== false) {
    const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(",", ".")) : 0;
    let receiptPath: string | null = null;
    try {
      const res = await fetch(mediaUrl);
      if (res.ok) {
        const blob = new Uint8Array(await res.arrayBuffer());
        const ext = (res.headers.get("content-type") ?? "image/jpeg").split("/")[1]?.split(";")[0] ?? "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const up = await sb.storage.from("expense-receipts").upload(path, blob, { contentType: res.headers.get("content-type") ?? "image/jpeg", upsert: false });
        if (!up.error) receiptPath = path;
      }
    } catch (e) { console.error("receipt download failed", e); }

    await sb.from("expenses").insert({
      company_id: companyId,
      user_id: userId,
      category_name: "WhatsApp Submission",
      amount,
      currency: "BDT",
      expense_date: today,
      description: text,
      receipt_path: receiptPath,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    });

    await sendWhatsApp({ phone, body: `Expense of ৳${amount} submitted! ✅\nPending manager approval.`, companyId, userId });
    return new Response(JSON.stringify({ ok: true, response: "expense" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // APPROVE / REJECT (manager only)
  if (isManager) {
    const approveMatch = text.match(/^APPROVE\s+([a-f0-9-]{6,})/i);
    if (approveMatch) {
      const expenseId = approveMatch[1];
      const { data: exp, error } = await sb.from("expenses").update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", expenseId).select("user_id, amount").maybeSingle();
      if (error || !exp) { await sendWhatsApp({ phone, body: `Couldn't approve ${expenseId}. ${error?.message ?? "Not found."}`, companyId, userId }); }
      else {
        await sendWhatsApp({ phone, body: `Approved expense ${expenseId.slice(0, 8)}.`, companyId, userId });
        const { data: rep } = await sb.from("profiles").select("whatsapp_number").eq("id", exp.user_id).maybeSingle();
        if (rep?.whatsapp_number) await sendWhatsApp({ phone: rep.whatsapp_number, body: `✅ Your expense of ৳${exp.amount} has been approved.`, companyId, userId: exp.user_id });
      }
      return new Response(JSON.stringify({ ok: true, response: "approve" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const rejectMatch = text.match(/^REJECT\s+([a-f0-9-]{6,})\s+(.+)$/i);
    if (rejectMatch) {
      const [, expenseId, reason] = rejectMatch;
      const { data: exp, error } = await sb.from("expenses").update({ status: "rejected", reviewed_by: userId, reviewed_at: new Date().toISOString(), reviewer_comment: reason }).eq("id", expenseId).select("user_id, amount").maybeSingle();
      if (error || !exp) { await sendWhatsApp({ phone, body: `Couldn't reject ${expenseId}. ${error?.message ?? "Not found."}`, companyId, userId }); }
      else {
        await sendWhatsApp({ phone, body: `Rejected expense ${expenseId.slice(0, 8)}.`, companyId, userId });
        const { data: rep } = await sb.from("profiles").select("whatsapp_number").eq("id", exp.user_id).maybeSingle();
        if (rep?.whatsapp_number) await sendWhatsApp({ phone: rep.whatsapp_number, body: `❌ Your expense of ৳${exp.amount} was rejected.\nReason: ${reason}`, companyId, userId: exp.user_id });
      }
      return new Response(JSON.stringify({ ok: true, response: "reject" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // MENU
  if (upper === "MENU" || upper === "HELP" || upper === "?") {
    const menu = "*Commands*\n• *TASKS* — today's tasks\n• *SCORE* — current month scorecard\n• *EXPENSE [amount]* + photo — submit a receipt" + (isManager ? "\n• *APPROVE {id}* — approve an expense\n• *REJECT {id} {reason}* — reject an expense" : "");
    await sendWhatsApp({ phone, body: menu, companyId, userId });
    return new Response(JSON.stringify({ ok: true, response: "menu" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // TASKS
  if (upper === "TASKS") {
    const { data: tasks } = await sb
      .from("tms_task_assignees")
      .select("tms_tasks!inner(id, title, priority, due_date, tms_task_statuses!inner(name, is_terminal))")
      .eq("user_id", userId)
      .eq("tms_tasks.due_date", today)
      .limit(15);
    type T = { tms_tasks: { id: string; title: string; priority: string | null; tms_task_statuses: { name: string; is_terminal: boolean } } };
    const open = ((tasks ?? []) as unknown as T[]).filter((t) => !t.tms_tasks.tms_task_statuses.is_terminal);
    const body = open.length
      ? `📋 *Today's tasks (${open.length})*\n` + open.map((t, i) => `${i + 1}. ${t.tms_tasks.title}${t.tms_tasks.priority ? ` (${t.tms_tasks.priority})` : ""}`).join("\n")
      : "🎉 No open tasks due today.";
    await sendWhatsApp({ phone, body, companyId, userId });
    return new Response(JSON.stringify({ ok: true, response: "tasks" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // SCORE
  if (upper === "SCORE") {
    const monthStart = today.slice(0, 7) + "-01";
    const [{ data: leads }, { data: target }, { data: visits }] = await Promise.all([
      sb.from("crm_leads").select("expected_value").eq("assigned_to", userId).eq("stage", "won").gte("won_at", monthStart),
      companyId ? sb.from("user_targets").select("revenue_target").eq("user_id", userId).eq("company_id", companyId).eq("period_start", monthStart).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("visit_checkins").select("id").eq("user_id", userId).gte("checkin_time", monthStart),
    ]);
    const won = (leads ?? []).reduce((s: number, l: { expected_value: number | null }) => s + Number(l.expected_value ?? 0), 0);
    const tgt = Number((target as { revenue_target?: number } | null)?.revenue_target ?? 0);
    const pct = tgt > 0 ? Math.round((won / tgt) * 100) : 0;
    const body = `📊 *This month*\n💰 Revenue: ৳${new Intl.NumberFormat("en-IN").format(won)}${tgt ? ` / ৳${new Intl.NumberFormat("en-IN").format(tgt)} (${pct}%)` : ""}\n🤝 Deals won: ${leads?.length ?? 0}\n📍 Visits: ${visits?.length ?? 0}`;
    await sendWhatsApp({ phone, body, companyId, userId });
    return new Response(JSON.stringify({ ok: true, response: "score" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Fallback
  await sendWhatsApp({ phone, body: "I didn't understand that. Reply *MENU* for available commands.", companyId, userId });
  return new Response(JSON.stringify({ ok: true, response: "fallback" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
