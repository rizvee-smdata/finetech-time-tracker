import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const companyInput = z.object({ companyId: z.string().uuid() });

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => companyInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("api_keys")
      .select("id, name, key_prefix, scopes, is_active, expires_at, last_used_at, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        name: z.string().min(1).max(80),
        scopes: z.array(z.enum(["read", "write"])).min(1),
        expiresAt: z.string().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { generateApiKey } = await import("@/lib/api/keys.server");
    const { raw, prefix, hash } = generateApiKey();
    const { error } = await (context.supabase as any).from("api_keys").insert({
      company_id: data.companyId,
      name: data.name,
      key_prefix: prefix,
      key_hash: hash,
      scopes: data.scopes,
      expires_at: data.expiresAt || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    // Returned once — never retrievable again.
    return { key: raw };
  });

export const setApiKeyActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("api_keys")
      .update({ is_active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => companyInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("webhook_endpoints")
      .select("id, url, secret, events, is_active, description, failure_count, last_success_at, last_failure_at, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        url: z.string().url().max(500),
        events: z.array(z.string().max(60)).min(1),
        description: z.string().max(200).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { generateWebhookSecret } = await import("@/lib/api/keys.server");
    const { error } = await (context.supabase as any).from("webhook_endpoints").insert({
      company_id: data.companyId,
      url: data.url,
      secret: generateWebhookSecret(),
      events: data.events,
      description: data.description || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean().optional(), events: z.array(z.string()).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.is_active !== undefined) patch["is_active"] = data.is_active;
    if (data.events) patch["events"] = data.events;
    const { error } = await (context.supabase as any).from("webhook_endpoints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => companyInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("webhook_deliveries")
      .select("id, event, status, attempts, response_code, created_at, delivered_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
