import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DEFAULT_PERMISSIONS, type EffectivePermissions } from "@/lib/permissions/fields";

const fieldMapSchema = z.record(z.string(), z.array(z.string()));

/** Effective permissions for the signed-in user. */
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EffectivePermissions> => {
    const sb = context.supabase as any;
    const [{ data: rules }, { data: isAdmin }] = await Promise.all([
      sb.rpc("pp_field_rules", { _user: context.userId }),
      sb.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    const r = (rules ?? {}) as any;
    return {
      ...DEFAULT_PERMISSIONS,
      profile_id: r.profile_id ?? null,
      profile_name: r.profile_name ?? null,
      record_visibility: r.record_visibility ?? "company",
      hidden_fields: r.hidden_fields ?? {},
      readonly_fields: r.readonly_fields ?? {},
      is_admin: !!isAdmin,
    };
  });

export const listPermissionProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("permission_profiles")
      .select("id, name, description, record_visibility, hidden_fields, readonly_fields, created_at")
      .eq("company_id", data.companyId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        companyId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(300).optional().nullable(),
        record_visibility: z.enum(["own", "team", "company"]),
        hidden_fields: fieldMapSchema.default({}),
        readonly_fields: fieldMapSchema.default({}),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      company_id: data.companyId,
      name: data.name,
      description: data.description ?? null,
      record_visibility: data.record_visibility,
      hidden_fields: data.hidden_fields,
      readonly_fields: data.readonly_fields,
      created_by: context.userId,
    };
    const sb = context.supabase as any;
    const q = data.id
      ? sb.from("permission_profiles").update(payload).eq("id", data.id).select("id").single()
      : sb.from("permission_profiles").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("permission_profiles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Company members with their assigned permission profile. */
export const listProfileAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: members, error: mErr } = await sb
      .from("company_members")
      .select("user_id")
      .eq("company_id", data.companyId);
    if (mErr) throw new Error(mErr.message);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (!ids.length) return [];
    const { data: rows, error } = await sb
      .from("profiles")
      .select("id, full_name, email, permission_profile_id, is_active")
      .in("id", ids)
      .order("full_name");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const assignPermissionProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ userId: z.string().uuid(), profileId: z.string().uuid().nullable() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("profiles")
      .update({ permission_profile_id: data.profileId })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
