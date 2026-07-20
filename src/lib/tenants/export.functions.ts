// GDPR-style tenant data export. Any company admin can export their own
// workspace's data as a single JSON blob.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EXPORT_TABLES = [
  "companies",
  "company_members",
  "profiles",
  "user_roles",
  "customers",
  "crm_leads",
  "crm_lead_activities",
  "crm_quotes",
  "crm_quote_line_items",
  "crm_products",
  "crm_oems",
  "contracts",
  "contract_payments",
  "expenses",
  "visit_checkins",
  "customer_visits",
  "tms_projects",
  "tms_tasks",
  "office_work_logs",
  "office_work_tasks",
  "reminders",
  "targets",
  "audit_logs",
];

export const exportTenantData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Authorize: caller must be admin of that company.
    const { data: member } = await supabaseAdmin
      .from("company_members")
      .select("company_id")
      .eq("company_id", data.companyId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) throw new Error("You are not a member of that company.");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Only admins can export tenant data.");

    const dump: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      company_id: data.companyId,
    };
    for (const table of EXPORT_TABLES) {
      try {
        const q = supabaseAdmin.from(table).select("*");
        // Most tables have company_id; profiles / user_roles are user-scoped.
        if (table === "profiles" || table === "user_roles") {
          const { data: members } = await supabaseAdmin
            .from("company_members")
            .select("user_id")
            .eq("company_id", data.companyId);
          const ids = (members ?? []).map((m: any) => m.user_id);
          if (ids.length === 0) {
            dump[table] = [];
            continue;
          }
          const col = table === "profiles" ? "id" : "user_id";
          const { data: rows } = await supabaseAdmin.from(table).select("*").in(col, ids);
          dump[table] = rows ?? [];
        } else if (table === "companies") {
          const { data: rows } = await q.eq("id", data.companyId);
          dump[table] = rows ?? [];
        } else {
          const { data: rows } = await q.eq("company_id", data.companyId);
          dump[table] = rows ?? [];
        }
      } catch (e) {
        dump[table] = { error: (e as Error).message };
      }
    }
    return dump;
  });

export const deleteTenantData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; confirmName: string }) =>
    z.object({ companyId: z.string().uuid(), confirmName: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("is_super_admin").eq("id", context.userId).maybeSingle();
    if (!prof?.is_super_admin) throw new Error("Only super-admins can permanently delete a tenant.");

    const { data: co } = await supabaseAdmin
      .from("companies").select("id, name").eq("id", data.companyId).maybeSingle();
    if (!co) throw new Error("Company not found.");
    if (co.name !== data.confirmName) throw new Error("Confirmation name does not match.");

    // Cascade delete via companies (all business tables FK to company_id with cascade).
    const { error } = await supabaseAdmin.from("companies").delete().eq("id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
