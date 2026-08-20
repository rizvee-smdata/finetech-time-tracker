import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve which company the analytics should run for.
 * Members get their own company. Super-admins / admins may pass any companyId
 * (they can switch companies in the UI without a company_members row).
 */
export async function resolveCompanyScope(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  requestedCompanyId?: string | null,
): Promise<string | null> {
  if (requestedCompanyId) {
    const { data: member } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .eq("company_id", requestedCompanyId)
      .limit(1)
      .maybeSingle();
    if (member?.company_id) return member.company_id as string;

    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const elevated =
      Boolean((prof as any)?.is_super_admin) ||
      (roles ?? []).some((r: any) => r.role === "admin");
    if (elevated) return requestedCompanyId;
  }

  const { data: any1 } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (any1?.company_id as string) ?? null;
}
