// Runs every minute. Finds Client Visit tasks scheduled to start in ~25-35 minutes
// that don't yet have a prep brief, generates one via generate-meeting-prep, then
// sends a WhatsApp pre-visit alert to the rep via WATI.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWhatsApp, normalisePhone } from "../_shared/wati.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PUBLIC_APP_URL =
  Deno.env.get("PUBLIC_APP_URL") ?? "https://lavisho-log-time.lovable.app";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Compute Asia/Dhaka now and the target window 25-35 minutes ahead.
    const nowUtc = new Date();
    const lo = new Date(nowUtc.getTime() + 25 * 60 * 1000);
    const hi = new Date(nowUtc.getTime() + 35 * 60 * 1000);

    // Convert to Dhaka date + time strings for comparison against tms_tasks.scheduled_date/_time
    const dhakaParts = (d: Date) => {
      const s = d.toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: false });
      // "05/06/2026, 14:32:00"
      const [date, time] = s.split(", ");
      const [dd, mm, yyyy] = date.split("/");
      return { date: `${yyyy}-${mm}-${dd}`, time };
    };
    const loP = dhakaParts(lo);
    const hiP = dhakaParts(hi);

    // Pull candidate tasks for today (or the date the window covers)
    const dates = Array.from(new Set([loP.date, hiP.date]));
    const { data: tasks } = await admin
      .from("tms_tasks")
      .select("id, company_id, title, lead_id, created_by, scheduled_date, scheduled_time, category")
      .in("scheduled_date", dates)
      .in("category", ["visit", "Client Visit"])
      .is("completed_at", null)
      .is("deleted_at", null)
      .not("scheduled_time", "is", null);

    const candidates: any[] = [];
    for (const t of tasks ?? []) {
      const sameLo = t.scheduled_date === loP.date;
      const sameHi = t.scheduled_date === hiP.date;
      if (!t.scheduled_time) continue;
      const tt = String(t.scheduled_time).slice(0, 8);
      if (sameLo && sameHi) {
        if (tt >= loP.time && tt <= hiP.time) candidates.push(t);
      } else if (sameLo) {
        if (tt >= loP.time) candidates.push(t);
      } else if (sameHi) {
        if (tt <= hiP.time) candidates.push(t);
      }
    }

    const processed: any[] = [];

    for (const t of candidates) {
      // Skip if already alerted
      const { data: existing } = await admin
        .from("meeting_prep_briefs")
        .select("id, status, alerted_rep_at, brief")
        .eq("task_id", t.id)
        .maybeSingle();
      if (existing?.alerted_rep_at) {
        processed.push({ task_id: t.id, skipped: "already_alerted" });
        continue;
      }

      // Trigger generator (idempotent via unique task_id)
      let brief = existing?.brief as any;
      let briefId = existing?.id as string | undefined;
      if (!existing || existing.status !== "ready") {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-meeting-prep`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": anonKey,
          },
          body: JSON.stringify({ task_id: t.id }),
        });
        if (!res.ok) {
          processed.push({ task_id: t.id, error: `gen ${res.status}` });
          continue;
        }
        const out = await res.json();
        brief = out.brief;
        briefId = out.brief_id;
      }

      // WhatsApp alert
      if (t.created_by && brief) {
        const { data: prof } = await admin
          .from("profiles")
          .select("phone, full_name")
          .eq("id", t.created_by)
          .maybeSingle();
        const phone = normalisePhone((prof as any)?.phone ?? null);
        let clientName = t.title;
        if (t.lead_id) {
          const { data: lead } = await admin
            .from("crm_leads")
            .select("customer_name, company_name")
            .eq("id", t.lead_id)
            .maybeSingle();
          if (lead) clientName = lead.company_name ?? lead.customer_name ?? t.title;
        }
        const body = `📋 Pre-Visit Brief: ${clientName}\nVisit in 30 mins.\n\n🎯 Key Priority: ${brief.one_key_priority ?? "Review brief"}\n\n• Open Items: ${(brief.open_items ?? []).length} pending\n• Questions ready: ${(brief.suggested_questions ?? []).length}\n\nOpen app for full brief → ${PUBLIC_APP_URL}/prep/${t.id}`;

        if (phone) {
          await sendWhatsApp({
            phone,
            body,
            companyId: t.company_id,
            userId: t.created_by,
            templateKey: "meeting_prep_alert",
            metadata: { task_id: t.id, brief_id: briefId },
          });
        }
        if (briefId) {
          await admin
            .from("meeting_prep_briefs")
            .update({ alerted_rep_at: new Date().toISOString() })
            .eq("id", briefId);
        }
      }

      processed.push({ task_id: t.id, ok: true });
    }

    return json(200, { window: { lo: loP, hi: hiP }, found: candidates.length, processed });
  } catch (e: any) {
    console.error("[meeting-prep-cron]", e);
    return json(500, { error: String(e?.message ?? e) });
  }
});
