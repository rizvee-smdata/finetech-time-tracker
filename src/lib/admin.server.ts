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