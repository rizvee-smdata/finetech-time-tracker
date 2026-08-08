import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "manager", "employee"]),
  company_ids: z.array(z.string().uuid()).optional().default([]),
});

export const customerRowSchema = z.object({
  customer_name: z.string().trim().min(1).max(200),
  contact_person: z.string().trim().max(200).optional().nullable(),
  designation: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const companySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, dashes"),
});

export async function getAdminCallerContext(supabase: any, userId: string) {
  const [{ data: roles }, { data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
    supabase.from("company_members").select("company_id").eq("user_id", userId),
  ]);
  const isAdmin = (roles ?? []).some((role: { role: string }) => role.role === "admin");
  const isSuperAdmin = Boolean((profile as { is_super_admin?: boolean } | null)?.is_super_admin);
  const companyIds = (memberships ?? []).map(
    (membership: { company_id: string }) => membership.company_id,
  );
  return { isAdmin, isSuperAdmin, companyIds };
}

export async function assertAdmin(supabase: any, userId: string) {
  const context = await getAdminCallerContext(supabase, userId);
  if (!context.isAdmin && !context.isSuperAdmin) throw new Error("Admin access required");
  return context;
}

export async function assertSuperAdmin(supabase: any, userId: string) {
  const context = await getAdminCallerContext(supabase, userId);
  if (!context.isSuperAdmin) throw new Error("Super admin access required");
  return context;
}