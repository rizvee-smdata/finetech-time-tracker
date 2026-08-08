import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  assertSuperAdmin,
  companySchema,
  createUserSchema,
  customerRowSchema,
} from "@/lib/admin.server";

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createUserSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSeatAvailable } = await import("@/lib/licensing/licenses.server");
    for (const cid of data.company_ids) await assertSeatAvailable(cid);
    const email = data.email.toLowerCase();
    let newUserId: string | null = null;
    let reused = false;

    // Look up the auth account before creating it. Error-message matching is not
    // reliable across Auth API versions and previously skipped the relink path.
    for (let page = 1; page <= 100 && !newUserId; page++) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listErr) throw new Error(listErr.message);
      const match = list.users.find((user) => (user.email ?? "").toLowerCase() === email);
      if (match) newUserId = match.id;
      if (list.users.length < 200) break;
    }

    if (newUserId) {
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
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (createErr) throw new Error(createErr.message);
      if (!created.user) throw new Error("The user account was not created.");
      newUserId = created.user.id;
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
    return { ok: true, id: newUserId, reused };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

export const importCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      rows: z.array(customerRowSchema).min(1).max(2000),
      company_id: z.string().uuid().nullable().optional(),
      kind: z.enum(["customer", "partner", "consultant"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

export const adminCreateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => companySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("companies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("company_members").delete().eq("user_id", data.user_id);
    if (data.company_ids.length) {
      const { error } = await supabaseAdmin
        .from("company_members")
        .insert(data.company_ids.map((cid) => ({ company_id: cid, user_id: data.user_id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
