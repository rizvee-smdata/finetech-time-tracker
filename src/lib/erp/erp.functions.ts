import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const providerEnum = z.enum(["xero", "quickbooks", "zoho_books", "tally", "generic"]);

const connectionInput = z.object({
  id: z.string().uuid().optional(),
  companyId: z.string().uuid(),
  provider: providerEnum,
  name: z.string().min(1).max(80),
  isActive: z.boolean().default(true),
  endpoint: z.string().max(500).optional().nullable(),
  authHeaderName: z.string().max(80).optional().nullable(),
  tokenEnv: z.string().max(120).optional().nullable(),
  tenantId: z.string().max(120).optional().nullable(),
  accountCode: z.string().max(40).optional().nullable(),
  defaultCurrency: z.string().max(8).optional().nullable(),
});

/** Loads the connection through the caller's RLS session — admins only by policy. */
async function loadConnection(supabase: any, id: string) {
  const { data, error } = await supabase.from("erp_connections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Connection not found or you don't have access to it.");
  return data;
}

async function log(row: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("erp_sync_log").insert(row as any);
}

export const listErpConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("erp_connections")
      .select("*")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveErpConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => connectionInput.parse(raw))
  .handler(async ({ data, context }) => {
    const payload = {
      company_id: data.companyId,
      provider: data.provider,
      name: data.name,
      is_active: data.isActive,
      default_currency: data.defaultCurrency || null,
      config: {
        endpoint: data.endpoint || undefined,
        auth_header_name: data.authHeaderName || undefined,
        token_env: data.tokenEnv || undefined,
        tenant_id: data.tenantId || undefined,
        account_code: data.accountCode || undefined,
      },
      created_by: context.userId,
    };
    const q = (context.supabase as any).from("erp_connections");
    const { error } = data.id ? await q.update(payload).eq("id", data.id) : await q.insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteErpConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("erp_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testErpConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const conn = await loadConnection(context.supabase, data.id);
    const { testConnection } = await import("@/lib/erp/erp.server");
    let result: { ok: boolean; message: string };
    try {
      result = await testConnection(conn);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : "Test failed" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("erp_connections")
      .update({ last_status: result.ok ? `ok: ${result.message}` : `error: ${result.message}`, last_sync_at: new Date().toISOString() } as any)
      .eq("id", data.id);
    await log({
      company_id: conn.company_id,
      connection_id: conn.id,
      direction: "test",
      entity_type: "connection",
      status: result.ok ? "success" : "error",
      message: result.message,
      created_by: context.userId,
    });
    return result;
  });

/** Push a quote to the accounting system as a draft invoice. */
export const pushQuoteToErp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ connectionId: z.string().uuid(), quoteId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const conn = await loadConnection(sb, data.connectionId);
    const { data: quote, error } = await sb
      .from("crm_quotes")
      .select("*, crm_leads(customer_name, company_name, email, phone)")
      .eq("id", data.quoteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quote) throw new Error("Quote not found.");

    const lead = quote.crm_leads ?? {};
    const invoice = {
      reference: `${quote.title} (v${quote.version})`,
      contactName: lead.company_name || lead.customer_name || "Customer",
      contactEmail: lead.email ?? null,
      currency: quote.currency || conn.default_currency || "USD",
      date: new Date().toISOString().slice(0, 10),
      dueDate: quote.valid_until ?? null,
      lines: [{ description: quote.title, quantity: 1, unitAmount: Number(quote.amount || 0) }],
    };

    const { pushInvoice } = await import("@/lib/erp/erp.server");
    let result;
    try {
      result = await pushInvoice(conn, invoice);
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : "Push failed" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (result.ok && result.externalId) {
      await supabaseAdmin.from("erp_entity_map").upsert(
        {
          company_id: conn.company_id,
          connection_id: conn.id,
          entity_type: "invoice",
          local_id: quote.id,
          external_id: result.externalId,
        } as any,
        { onConflict: "connection_id,entity_type,local_id" },
      );
    }
    await log({
      company_id: conn.company_id,
      connection_id: conn.id,
      direction: "push",
      entity_type: "invoice",
      local_id: quote.id,
      external_id: result.externalId ?? null,
      status: result.ok ? "success" : "error",
      message: result.message,
      payload: invoice,
      created_by: context.userId,
    });
    return result;
  });

/** Push customers that have never been synced to this connection. */
export const syncCustomersToErp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ connectionId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const conn = await loadConnection(sb, data.connectionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mapped } = await supabaseAdmin
      .from("erp_entity_map")
      .select("local_id")
      .eq("connection_id", conn.id)
      .eq("entity_type", "customer");
    const done = new Set((mapped ?? []).map((m: any) => m.local_id));

    const { data: customers, error } = await sb
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("company_id", conn.company_id)
      .limit(500);
    if (error) throw new Error(error.message);

    const pending = (customers ?? []).filter((c: any) => !done.has(c.id)).slice(0, data.limit);
    const { pushCustomer } = await import("@/lib/erp/erp.server");

    let synced = 0;
    let failed = 0;
    for (const c of pending) {
      let result;
      try {
        result = await pushCustomer(conn, { name: c.name, email: c.email, phone: c.phone, address: c.address });
      } catch (e) {
        result = { ok: false, message: e instanceof Error ? e.message : "Push failed" };
      }
      if (result.ok) {
        synced++;
        if (result.externalId) {
          await supabaseAdmin.from("erp_entity_map").upsert(
            {
              company_id: conn.company_id,
              connection_id: conn.id,
              entity_type: "customer",
              local_id: c.id,
              external_id: result.externalId,
            } as any,
            { onConflict: "connection_id,entity_type,local_id" },
          );
        }
      } else {
        failed++;
      }
      await log({
        company_id: conn.company_id,
        connection_id: conn.id,
        direction: "push",
        entity_type: "customer",
        local_id: c.id,
        external_id: result.externalId ?? null,
        status: result.ok ? "success" : "error",
        message: result.message,
        created_by: context.userId,
      });
      if (failed >= 3) break;
    }

    await supabaseAdmin
      .from("erp_connections")
      .update({ last_sync_at: new Date().toISOString(), last_status: `customers: ${synced} synced, ${failed} failed` } as any)
      .eq("id", conn.id);

    return { synced, failed, remaining: Math.max(0, (customers ?? []).length - done.size - synced) };
  });

export const listErpSyncLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("erp_sync_log")
      .select("id, connection_id, direction, entity_type, local_id, external_id, status, message, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
