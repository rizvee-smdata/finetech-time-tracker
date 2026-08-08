import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getCallerContext(supabase: any, userId: string) {
  const [{ data: roles }, { data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
    supabase.from("company_members").select("company_id").eq("user_id", userId),
  ]);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  const isSuperAdmin = Boolean((profile as any)?.is_super_admin);
  const companyIds = (memberships ?? []).map((m: any) => m.company_id as string);
  return { isAdmin, isSuperAdmin, companyIds };
}

async function assertAdmin(supabase: any, userId: string) {
  const ctx = await getCallerContext(supabase, userId);
  if (!ctx.isAdmin && !ctx.isSuperAdmin) throw new Error("Admin access required");
  return ctx;
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const ctx = await getCallerContext(supabase, userId);
  if (!ctx.isSuperAdmin) throw new Error("Super admin access required");
  return ctx;
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
    const { assertSeatAvailable } = await import("@/lib/licensing/licenses.server");
    for (const cid of data.company_ids) await assertSeatAvailable(cid);
    const email = data.email.toLowerCase();
    let newUserId: string | null = null;
    let reused = false;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });

    if (error) {
      const alreadyExists =
        /already/i.test(error.message) && /regist|exist/i.test(error.message);
      if (!alreadyExists) throw new Error(error.message);

      // The auth account already exists (e.g. created before, or left over after a
      // company was removed). Re-use it and (re)attach role + company memberships.
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      newUserId = (existingProfile as { id: string } | null)?.id ?? null;

      if (!newUserId) {
        // Fall back to scanning the auth users list.
        for (let page = 1; page <= 20 && !newUserId; page++) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 200,
          });
          if (listErr) throw new Error(listErr.message);
          const match = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
          if (match) newUserId = match.id;
          if (list.users.length < 200) break;
        }
      }
      if (!newUserId) throw new Error("An account with this email exists but could not be found.");

      reused = true;
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(newUserId, {
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (updErr) throw new Error(updErr.message);
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: newUserId, full_name: data.full_name, email }, { onConflict: "id" });
    } else {
      newUserId = created.user!.id;
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (rErr) throw new Error(rErr.message);

    if (data.company_ids.length) {
      const { error: mErr } = await supabaseAdmin
        .from("company_members")
        .upsert(
          data.company_ids.map((cid) => ({ company_id: cid, user_id: newUserId })),
          { onConflict: "company_id,user_id" },
        );
      if (mErr) throw new Error(mErr.message);
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
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id);
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await assertAdmin(context.supabase, context.userId);
    const [{ data: profiles }, { data: roles }, { data: members }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, created_at, is_super_admin"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("company_members").select("user_id, company_id"),
    ]);
    const allowed = new Set(caller.companyIds);
    const rows = (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      company_ids: (members ?? []).filter((m) => m.user_id === p.id).map((m) => m.company_id),
    }));
    if (caller.isSuperAdmin) return rows;
    // Non-super admins: only users who share at least one company with them, and hide super_admins
    return rows.filter((r) =>
      !r.is_super_admin && (r.id === context.userId || r.company_ids.some((cid) => allowed.has(cid))),
    );
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
    await assertSuperAdmin(context.supabase, context.userId);
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
    await assertSuperAdmin(context.supabase, context.userId);
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
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await assertAdmin(context.supabase, context.userId);
    const [{ data: companies }, { data: members }] = await Promise.all([
      supabaseAdmin.from("companies").select("*").order("name"),
      supabaseAdmin.from("company_members").select("company_id, user_id"),
    ]);
    const allowed = new Set(caller.companyIds);
    const filtered = caller.isSuperAdmin
      ? (companies ?? [])
      : (companies ?? []).filter((c) => allowed.has(c.id));
    return filtered.map((c) => ({
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
