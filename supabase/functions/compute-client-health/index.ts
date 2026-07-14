// Compute client health scores for all crm_accounts.
// - Calls public.compute_client_health(account_id) RPC for each account.
// - Upserts public.client_health_scores.
// - Inserts daily snapshot in public.client_health_history.
// - Emits public.client_health_rag_alerts when an account's RAG changes
//   (including newly-red transitions).
//
// Trigger: daily via pg_cron, or manually invoked.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { requireCronOrUser, unauthorized } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireCronOrUser(req);
  if (!guard.ok) return unauthorized(corsHeaders, guard.reason);

  try {

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional scope: { company_id?, account_id? }
    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }

    let accountsQ = supabase.from("crm_accounts").select("id, name, company_id");
    if (body.company_id) accountsQ = accountsQ.eq("company_id", body.company_id);
    if (body.account_id) accountsQ = accountsQ.eq("id", body.account_id);
    const { data: accounts, error: aErr } = await accountsQ;
    if (aErr) throw aErr;

    // existing rag snapshot for change detection
    const { data: existing } = await supabase
      .from("client_health_scores")
      .select("account_id, rag_status");
    const prevRag = new Map<string, string>(
      (existing ?? []).map((r: any) => [r.account_id, r.rag_status]),
    );

    let processed = 0;
    let alertsCreated = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const acc of accounts ?? []) {
      const { data: rows, error: cErr } = await supabase
        .rpc("compute_client_health", { _account: acc.id });
      if (cErr) { console.error("compute err", acc.id, cErr.message); continue; }
      const r = (rows ?? [])[0];
      if (!r) continue;

      const payload = {
        company_id: r.company_id,
        account_id: acc.id,
        assigned_rep_id: r.assigned_rep_id,
        score: r.score,
        rag_status: r.rag_status,
        last_visit_date: r.last_visit_date,
        last_visit_days: r.last_visit_days,
        open_deals_count: r.open_deals_count,
        open_deals_value: r.open_deals_value,
        pending_followups: r.pending_followups,
        score_breakdown: r.score_breakdown,
        calculated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from("client_health_scores")
        .upsert(payload, { onConflict: "account_id" });
      if (upErr) { console.error("upsert err", acc.id, upErr.message); continue; }

      // daily history snapshot
      await supabase.from("client_health_history").upsert({
        company_id: r.company_id,
        account_id: acc.id,
        score: r.score,
        rag_status: r.rag_status,
        calculated_on: today,
      }, { onConflict: "account_id,calculated_on" });

      // RAG-change alert
      const before = prevRag.get(acc.id) ?? null;
      if (before !== r.rag_status) {
        await supabase.from("client_health_rag_alerts").insert({
          company_id: r.company_id,
          account_id: acc.id,
          account_name: acc.name,
          assigned_rep_id: r.assigned_rep_id,
          from_rag: before,
          to_rag: r.rag_status,
          score: r.score,
          last_visit_days: r.last_visit_days,
        });
        alertsCreated++;

        // For newly-red accounts, drop an in-app reminder for the rep.
        if (r.rag_status === "red" && r.assigned_rep_id) {
          await supabase.from("reminders").insert({
            user_id: r.assigned_rep_id,
            company_id: r.company_id,
            title: `Alert: ${acc.name} health dropped to ${r.score}`,
            body: `Last visited ${r.last_visit_days >= 9999 ? "never" : r.last_visit_days + " days ago"}. Action required.`,
            remind_at: new Date().toISOString(),
          });
        }
      }

      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, alertsCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message ?? "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
