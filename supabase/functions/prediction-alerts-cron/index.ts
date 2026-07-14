// Daily 7 AM Asia/Dhaka job: regenerate predictions for all reps with monthly
// revenue targets, then notify reps (<80%) and managers (<60%) via WhatsApp.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWhatsApp, normalisePhone } from "../_shared/wati.ts";
import { requireCronOnly, unauthorized } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function fmtBdt(n: number) {
  return "৳" + Math.round(n).toLocaleString("en-IN");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = requireCronOnly(req);
  if (!guard.ok) return unauthorized(corsHeaders, guard.reason);

  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const dhakaToday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
    const monthStart = new Date(dhakaToday.getFullYear(), dhakaToday.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(dhakaToday.getFullYear(), dhakaToday.getMonth() + 1, 0).toISOString().slice(0, 10);

    // Find reps with an active monthly revenue target.
    const { data: targets } = await admin
      .from("targets")
      .select("company_id, user_id")
      .eq("metric", "revenue")
      .eq("scope", "user")
      .lte("period_start", monthEnd)
      .gte("period_end", monthStart);

    const unique = new Map<string, { company_id: string; user_id: string }>();
    for (const t of (targets ?? []) as any[]) {
      if (t.user_id && t.company_id) unique.set(`${t.company_id}:${t.user_id}`, t);
    }

    const results: Array<{ user_id: string; status: string; achievement_pct?: number }> = [];

    for (const { company_id, user_id } of unique.values()) {
      try {
        // Call generate-prediction as an internal request. Use service-key auth as the rep.
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-prediction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ company_id, rep_id: user_id, force: true }),
        });
        if (!res.ok) {
          results.push({ user_id, status: `failed:${res.status}` });
          continue;
        }
        const { prediction } = await res.json();
        const pct = Number(prediction?.achievement_pct ?? 0);

        // Notify the rep if <80%
        if (pct < 80) {
          const { data: prof } = await admin.from("profiles").select("phone, full_name").eq("id", user_id).maybeSingle();
          const phone = normalisePhone((prof as any)?.phone ?? null);
          if (phone) {
            const body = `📊 Prediction Update\n\nYou are on track for ${pct}% of your monthly target.\nGap: ${fmtBdt(Number(prediction.gap_to_target))}\n\n💡 ${prediction.recommendation}`;
            await sendWhatsApp({ phone, body, companyId: company_id, userId: user_id, templateKey: "prediction_rep_alert" });
            await admin.from("prediction_runs").update({ alerted_rep_at: new Date().toISOString() }).eq("id", prediction.id);
          }
        }

        // Notify managers if <60%
        if (pct < 60) {
          const { data: members } = await admin
            .from("company_members")
            .select("user_id")
            .eq("company_id", company_id);
          for (const m of (members ?? []) as any[]) {
            const { data: isStaffRow } = await admin.rpc("is_staff", { _user_id: m.user_id });
            if (!isStaffRow) continue;
            const { data: mgr } = await admin.from("profiles").select("phone").eq("id", m.user_id).maybeSingle();
            const phone = normalisePhone((mgr as any)?.phone ?? null);
            if (!phone) continue;
            const { data: repProf } = await admin.from("profiles").select("full_name").eq("id", user_id).maybeSingle();
            const body = `⚠️ Rep at Risk\n\n${(repProf as any)?.full_name ?? "A rep"} is predicted to hit only ${pct}% this month.\nGap: ${fmtBdt(Number(prediction.gap_to_target))}\nRisk: ${prediction.risk_factor}`;
            await sendWhatsApp({ phone, body, companyId: company_id, userId: m.user_id, templateKey: "prediction_manager_alert" });
          }
          await admin.from("prediction_runs").update({ alerted_manager_at: new Date().toISOString() }).eq("id", prediction.id);
        }

        results.push({ user_id, status: "ok", achievement_pct: pct });
      } catch (e) {
        results.push({ user_id, status: `error:${(e as Error).message.slice(0, 100)}` });
      }
    }

    return json(200, { processed: results.length, results });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
