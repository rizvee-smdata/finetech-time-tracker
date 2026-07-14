// Notify managers when a rep submits an expense or visit_report.
// Invocation: client calls this fn after a successful insert.
//
// Body: { entity_type: 'expense' | 'visit_report', entity_id: string }
//
// Writes a row to public.reminders for every manager/admin in the same
// company so they receive an in-app notification via the existing
// reminders/realtime pipeline.
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

    const { entity_type, entity_id } = await req.json();
    if (!["expense", "visit_report"].includes(entity_type) || !entity_id) {
      return new Response(JSON.stringify({ error: "bad_request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // load entity
    const table = entity_type === "expense" ? "expenses" : "visit_reports";
    const { data: row, error: rowErr } = await supabase
      .from(table)
      .select("id, company_id, user_id")
      .eq("id", entity_id)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // rep name
    const { data: rep } = await supabase
      .from("profiles").select("full_name").eq("id", row.user_id).maybeSingle();
    const repName = rep?.full_name ?? "A rep";

    // recipients = admins + managers in same company
    const { data: members } = await supabase
      .from("company_members").select("user_id").eq("company_id", row.company_id);
    const userIds = (members ?? []).map((m: any) => m.user_id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roles } = await supabase
      .from("user_roles").select("user_id, role").in("user_id", userIds);
    const recipients = (roles ?? [])
      .filter((r: any) => r.role === "admin" || r.role === "manager")
      .map((r: any) => r.user_id);

    const label = entity_type === "expense" ? "expense" : "visit report";
    const rows = recipients.map((uid) => ({
      user_id: uid,
      company_id: row.company_id,
      title: `New ${label} from ${repName}`,
      body: `Awaiting your review`,
      remind_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from("reminders").insert(rows);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, sent: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? "error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
