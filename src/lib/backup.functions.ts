import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Admin access required");
  }
}

// Configuration = structural / setup data (settings, templates, products, etc.)
export const CONFIG_TABLES = [
  "companies",
  "company_members",
  "company_holidays",
  "user_roles",
  "profiles",
  "attendance_settings",
  "expense_categories",
  "expense_approver_assignments",
  "crm_products",
  "crm_territories",
  "crm_competitors",
  "crm_message_templates",
  "crm_document_templates",
  "crm_sequences",
  "crm_sequence_steps",
  "crm_targets",
  "crm_saved_views",
  "targets",
  "tms_task_statuses",
  "tms_projects",
  "tms_project_members",
  "tms_labels",
  "tms_milestones",
  "tms_sprints",
  "tms_saved_views",
  "tms_notification_prefs",
  "followup_settings",
  "narrative_settings",
  "whatsapp_settings",
  "whatsapp_templates",
  "kb_oems",
  "survey_templates",
  "notification_preferences",
] as const;

// Data = transactional / operational records
export const DATA_TABLES = [
  "customers",
  "crm_accounts",
  "crm_leads",
  "crm_lead_activities",
  "crm_lead_attachments",
  "crm_lead_products",
  "crm_lead_stage_history",
  "crm_call_logs",
  "crm_quotes",
  "crm_quote_line_items",
  "customer_visits",
  "visit_checkins",
  "visit_reports",
  "ai_visit_reports",
  "eod_summaries",
  "expenses",
  "approval_logs",
  "attendance_records",
  "reminders",
  "followups",
  "followup_sends",
  "tms_tasks",
  "tms_task_assignees",
  "tms_task_comments",
  "tms_task_activity",
  "tms_time_logs",
  "tms_checklist_items",
  "tms_task_attachments",
  "tms_task_dependencies",
  "tms_task_labels",
  "chat_channels",
  "chat_channel_members",
  "chat_messages",
  "chat_reactions",
  "narrative_reports",
  "performance_snapshots",
  "kb_articles",
  "kb_article_versions",
  "audit_logs",
  "survey_responses",
  "contracts",
  "contract_payments",
  "daily_routes",
  "route_plans",
  "route_plan_stops",
  "meeting_prep_briefs",
  "coaching_insights",
  "coaching_flags",
  "client_health_scores",
  "client_health_history",
  "client_health_rag_alerts",
] as const;

async function dumpTables(tables: readonly string[]) {
  const result: Record<string, any[]> = {};
  const errors: Record<string, string> = {};
  for (const t of tables) {
    try {
      // page through in chunks to avoid huge single responses
      const pageSize = 1000;
      let from = 0;
      const rows: any[] = [];
      // safety cap
      for (let page = 0; page < 200; page++) {
        const { data, error } = await (supabaseAdmin as any)
          .from(t)
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) {
          errors[t] = error.message;
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (!errors[t]) result[t] = rows;
    } catch (e: any) {
      errors[t] = e?.message ?? String(e);
    }
  }
  return { tables: result, errors };
}

export const backupConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { tables, errors } = await dumpTables(CONFIG_TABLES);
    return {
      kind: "configuration" as const,
      generated_at: new Date().toISOString(),
      generated_by: context.userId,
      tables,
      errors,
    };
  });

export const backupData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { tables, errors } = await dumpTables(DATA_TABLES);
    return {
      kind: "data" as const,
      generated_at: new Date().toISOString(),
      generated_by: context.userId,
      tables,
      errors,
    };
  });

const restoreSchema = z.object({
  kind: z.enum(["configuration", "data"]),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.any()))),
  mode: z.enum(["upsert", "skip-existing"]).default("upsert"),
});

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => restoreSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const allowed = new Set<string>(
      data.kind === "configuration" ? CONFIG_TABLES : DATA_TABLES,
    );
    const summary: Record<string, { inserted: number; error?: string }> = {};
    // Restore in the listed order so parents come before children
    const ordered = (data.kind === "configuration" ? CONFIG_TABLES : DATA_TABLES) as readonly string[];
    for (const t of ordered) {
      const rows = data.tables[t];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      if (!allowed.has(t)) continue;
      try {
        const chunkSize = 500;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const q = (supabaseAdmin as any).from(t).upsert(chunk, {
            onConflict: "id",
            ignoreDuplicates: data.mode === "skip-existing",
          });
          const { error } = await q;
          if (error) throw new Error(error.message);
          inserted += chunk.length;
        }
        summary[t] = { inserted };
      } catch (e: any) {
        summary[t] = { inserted: 0, error: e?.message ?? String(e) };
      }
    }
    return { ok: true, summary };
  });
