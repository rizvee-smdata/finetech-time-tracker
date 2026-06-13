import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

// ---------- Recycle Bin ----------

export const listRecycleBin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entity_type?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("audit_logs")
      .select("id, entity_type, entity_id, actor_id, summary, metadata, created_at, company_id")
      .eq("action", "delete")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      actor_id: r.actor_id,
      created_at: r.created_at,
      name:
        r.metadata?.row?.customer_name ||
        r.metadata?.row?.name ||
        r.metadata?.row?.title ||
        r.metadata?.row?.id ||
        "(unknown)",
    }));
  });

export const restoreDeleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ entity_type: z.string(), entity_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).rpc("restore_deleted_entity", {
      _entity_type: data.entity_type,
      _entity_id: data.entity_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Audit Log Viewer ----------

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entity_type?: string; action?: string; limit?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("audit_logs")
      .select("id, entity_type, entity_id, action, actor_id, summary, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 200, 1000));
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.action) q = q.eq("action", data.action);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Maintenance Mode ----------

export const listCompaniesMaintenance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("companies")
      .select("id, name, maintenance_mode")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setMaintenanceMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ company_id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("companies")
      .update({ maintenance_mode: data.enabled })
      .eq("id", data.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Automatic snapshot to storage (used by cron) ----------

export const snapshotToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await runSnapshot();
  });

export async function runSnapshot() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { CONFIG_TABLES, DATA_TABLES } = await import("./backup.functions");

  async function dump(tables: readonly string[]) {
    const out: Record<string, any[]> = {};
    const errors: Record<string, string> = {};
    for (const t of tables) {
      try {
        const pageSize = 1000;
        let from = 0;
        const rows: any[] = [];
        for (let p = 0; p < 200; p++) {
          const { data, error } = await (supabaseAdmin as any)
            .from(t).select("*").range(from, from + pageSize - 1);
          if (error) { errors[t] = error.message; break; }
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        if (!errors[t]) out[t] = rows;
      } catch (e: any) { errors[t] = e?.message ?? String(e); }
    }
    return { tables: out, errors };
  }

  const cfg = await dump(CONFIG_TABLES);
  const dat = await dump(DATA_TABLES);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    generated_at: new Date().toISOString(),
    configuration: cfg.tables,
    data: dat.tables,
    errors: { configuration: cfg.errors, data: dat.errors },
  };
  const path = `auto/${stamp}.json`;
  const { error } = await (supabaseAdmin as any).storage
    .from("backups")
    .upload(path, JSON.stringify(payload), {
      contentType: "application/json",
      upsert: true,
    });
  if (error) throw new Error(error.message);

  // Retention: delete files older than 30 days under auto/
  const { data: list } = await (supabaseAdmin as any).storage
    .from("backups")
    .list("auto", { limit: 1000 });
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const toDelete = (list ?? [])
    .filter((f: any) => new Date(f.created_at ?? f.updated_at ?? 0).getTime() < cutoff)
    .map((f: any) => `auto/${f.name}`);
  if (toDelete.length) {
    await (supabaseAdmin as any).storage.from("backups").remove(toDelete);
  }

  // Purge soft-deleted >30d (no-op with audit-based recycle bin; still call to be safe)
  try {
    await (supabaseAdmin as any).rpc("purge_old_soft_deletes");
  } catch {}

  return { ok: true, path, retained_kept: (list ?? []).length - toDelete.length };
}

// ---------- List recent auto-snapshots ----------

export const listSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).storage
      .from("backups")
      .list("auto", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSnapshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await (supabaseAdmin as any).storage
      .from("backups")
      .createSignedUrl(`auto/${data.path}`, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl as string };
  });
