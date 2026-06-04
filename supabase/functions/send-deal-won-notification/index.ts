import { admin, sendWhatsApp, corsHeaders } from "../_shared/wati.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = admin();
  let lead_id: string | undefined;
  try { const body = await req.json(); lead_id = body.lead_id; } catch { /* ignore */ }
  if (!lead_id) return new Response(JSON.stringify({ ok: false, error: "missing lead_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: lead, error } = await sb
    .from("crm_leads")
    .select("id, company_id, customer_name, company_name, expected_value, currency, assigned_to")
    .eq("id", lead_id)
    .maybeSingle();
  if (error || !lead) return new Response(JSON.stringify({ ok: false, error: error?.message ?? "lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: settings } = await sb
    .from("whatsapp_settings")
    .select("deal_won_rep_enabled, deal_won_manager_enabled")
    .eq("company_id", lead.company_id)
    .maybeSingle();
  if (!settings) return new Response(JSON.stringify({ ok: true, skipped: "no settings" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Templates
  const { data: tpls } = await sb
    .from("whatsapp_templates")
    .select("key, body, enabled")
    .eq("company_id", lead.company_id)
    .in("key", ["deal_won_rep", "deal_won_manager"]);
  const tplMap = new Map((tpls ?? []).map((t) => [t.key, t]));
  const repTpl = tplMap.get("deal_won_rep")?.body ?? "Deal Won! 🎉 {client} - ৳{amount}";
  const mgrTpl = tplMap.get("deal_won_manager")?.body ?? "{rep_name} just closed {client} for ৳{amount}!";

  const amount = new Intl.NumberFormat("en-IN").format(Number(lead.expected_value ?? 0));
  const client = `${lead.customer_name}${lead.company_name ? ` (${lead.company_name})` : ""}`;

  let sent = 0;

  // Rep
  if (settings.deal_won_rep_enabled && lead.assigned_to) {
    const { data: rep } = await sb.from("profiles").select("id, full_name, whatsapp_number").eq("id", lead.assigned_to).maybeSingle();
    if (rep?.whatsapp_number) {
      const body = repTpl.replace(/\{client\}/g, client).replace(/\{amount\}/g, amount).replace(/\{product\}/g, "—").replace(/\{currency\}/g, lead.currency ?? "BDT");
      const r = await sendWhatsApp({ phone: rep.whatsapp_number, body, companyId: lead.company_id, userId: rep.id, templateKey: "deal_won_rep", metadata: { lead_id } });
      if (r.ok) sent++;
    }
  }

  // Managers
  if (settings.deal_won_manager_enabled) {
    const { data: repProfile } = lead.assigned_to
      ? await sb.from("profiles").select("full_name").eq("id", lead.assigned_to).maybeSingle()
      : { data: null };
    const repName = repProfile?.full_name ?? "A teammate";

    const { data: managers } = await sb
      .from("company_members")
      .select("user_id, profiles!inner(id, full_name, whatsapp_number), user_roles:user_roles!inner(role)")
      .eq("company_id", lead.company_id)
      .in("user_roles.role", ["admin", "manager"]);

    type Mgr = { user_id: string; profiles: { id: string; full_name: string | null; whatsapp_number: string | null } };
    for (const m of (managers ?? []) as unknown as Mgr[]) {
      if (!m.profiles?.whatsapp_number) continue;
      const body = mgrTpl.replace(/\{rep_name\}/g, repName).replace(/\{client\}/g, client).replace(/\{amount\}/g, amount).replace(/\{currency\}/g, lead.currency ?? "BDT");
      const r = await sendWhatsApp({ phone: m.profiles.whatsapp_number, body, companyId: lead.company_id, userId: m.user_id, templateKey: "deal_won_manager", metadata: { lead_id } });
      if (r.ok) sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
