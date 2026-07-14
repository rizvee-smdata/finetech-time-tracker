import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const FieldKind = z.enum([
  "text","textarea","number","date","datetime","boolean",
  "select","multiselect","url","email","phone","reference",
]);
export type FieldKind = z.infer<typeof FieldKind>;

/* ---------- Objects ---------- */

export const listObjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("custom_object_defs")
      .select("id, api_name, label, plural_label, icon, description, is_active, created_at")
      .eq("company_id", data.companyId)
      .order("label");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid().optional(), apiName: z.string().optional(), companyId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("custom_object_defs")
      .select("id, api_name, label, plural_label, icon, description, is_active, company_id")
      .eq("company_id", data.companyId);
    if (data.id) q = q.eq("id", data.id);
    if (data.apiName) q = q.eq("api_name", data.apiName);
    const { data: row, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Object not found");
    return row;
  });

export const upsertObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    id: z.string().uuid().optional(),
    companyId: z.string().uuid(),
    api_name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, digits, underscores"),
    label: z.string().min(1),
    plural_label: z.string().min(1),
    icon: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    is_active: z.boolean().default(true),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const payload = {
      id: data.id,
      company_id: data.companyId,
      api_name: data.api_name,
      label: data.label,
      plural_label: data.plural_label,
      icon: data.icon ?? null,
      description: data.description ?? null,
      is_active: data.is_active,
      created_by: context.userId,
    };
    const { data: row, error } = await (context.supabase as any)
      .from("custom_object_defs")
      .upsert(payload, { onConflict: "id" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("custom_object_defs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Fields ---------- */

export const listFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ objectId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("custom_object_field_defs")
      .select("id, object_id, api_name, label, kind, required, options, reference_object_id, order_index, help_text, is_name_field")
      .eq("object_id", data.objectId)
      .order("order_index");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    id: z.string().uuid().optional(),
    object_id: z.string().uuid(),
    api_name: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    kind: FieldKind,
    required: z.boolean().default(false),
    options: z.array(z.string()).default([]),
    reference_object_id: z.string().uuid().nullable().optional(),
    order_index: z.number().int().default(0),
    help_text: z.string().nullable().optional(),
    is_name_field: z.boolean().default(false),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    if (data.is_name_field) {
      await (context.supabase as any).from("custom_object_field_defs")
        .update({ is_name_field: false })
        .eq("object_id", data.object_id);
    }
    const { data: row, error } = await (context.supabase as any)
      .from("custom_object_field_defs")
      .upsert({
        id: data.id,
        object_id: data.object_id,
        api_name: data.api_name,
        label: data.label,
        kind: data.kind,
        required: data.required,
        options: data.options,
        reference_object_id: data.reference_object_id ?? null,
        order_index: data.order_index,
        help_text: data.help_text ?? null,
        is_name_field: data.is_name_field,
      }, { onConflict: "id" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("custom_object_field_defs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Records ---------- */

export const listRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    objectId: z.string().uuid(),
    companyId: z.string().uuid(),
    search: z.string().optional(),
    limit: z.number().int().max(500).default(200),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any).from("custom_object_records")
      .select("id, name, data, owner_id, created_at, updated_at")
      .eq("company_id", data.companyId)
      .eq("object_id", data.objectId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    id: z.string().uuid().optional(),
    objectId: z.string().uuid(),
    companyId: z.string().uuid(),
    data: z.record(z.string(), z.unknown()).default({}),
  }).parse(raw))
  .handler(async ({ data, context }) => {
    const payload: any = {
      id: data.id,
      object_id: data.objectId,
      company_id: data.companyId,
      data: data.data,
      created_by: context.userId,
    };
    if (!data.id) payload.owner_id = context.userId;
    const { data: row, error } = await (context.supabase as any)
      .from("custom_object_records")
      .upsert(payload, { onConflict: "id" })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("custom_object_records").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
