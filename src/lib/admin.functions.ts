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
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("Admin access required");
}

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "manager", "employee"]),
  company_ids: z.array(z.string().uuid()).optional().default([]),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const newUserId = created.user!.id;
    if (data.role !== "employee") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (rErr) throw new Error(rErr.message);
    }
    if (data.company_ids.length) {
      await supabaseAdmin
        .from("company_members")
        .insert(data.company_ids.map((cid) => ({ company_id: cid, user_id: newUserId })));
    }
    // Force password change on first login
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", newUserId);
    return { ok: true, id: newUserId };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      password: z.string().min(8).max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [{ data: profiles }, { data: roles }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("company_members").select("user_id, company_id"),
    ]);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      company_ids: (members ?? []).filter((m) => m.user_id === p.id).map((m) => m.company_id),
    }));
  });

const customerRow = z.object({
  customer_name: z.string().trim().min(1).max(200),
  contact_person: z.string().trim().max(200).optional().nullable(),
  designation: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const importCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      rows: z.array(customerRow).min(1).max(2000),
      company_id: z.string().uuid().nullable().optional(),
      kind: z.enum(["customer", "partner", "consultant"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const rows = data.rows.map((r) => ({
      customer_name: r.customer_name,
      contact_person: r.contact_person || null,
      designation: r.designation || null,
      email: r.email ? r.email : null,
      phone: r.phone || null,
      created_by: context.userId,
      company_id: data.company_id ?? null,
      kind: data.kind ?? "customer",
    }));
    const { error, count } = await supabaseAdmin
      .from("customers")
      .insert(rows, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? rows.length };
  });

// ---------- Companies ----------

const companySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, dashes"),
});

export const adminCreateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => companySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: created, error } = await supabaseAdmin
      .from("companies")
      .insert({ name: data.name, slug: data.slug })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const adminUpdateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => companySchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ name: data.name, slug: data.slug })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [{ data: companies }, { data: members }] = await Promise.all([
      supabaseAdmin.from("companies").select("*").order("name"),
      supabaseAdmin.from("company_members").select("company_id, user_id"),
    ]);
    return (companies ?? []).map((c) => ({
      ...c,
      member_count: (members ?? []).filter((m) => m.company_id === c.id).length,
    }));
  });

export const adminSetUserCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      company_ids: z.array(z.string().uuid()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await supabaseAdmin.from("company_members").delete().eq("user_id", data.user_id);
    if (data.company_ids.length) {
      const { error } = await supabaseAdmin
        .from("company_members")
        .insert(data.company_ids.map((cid) => ({ company_id: cid, user_id: data.user_id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
