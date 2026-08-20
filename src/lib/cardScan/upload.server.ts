import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Store a card-scan image on behalf of a verified user.
 * Used as a fallback when the browser's direct storage upload is rejected
 * (e.g. the user is an admin/super-admin without a company_members row, which
 * the bucket policy requires).
 */
export async function storeCardScanFile(params: {
  supabase: any;
  userId: string;
  companyId: string;
  base64: string;
  mime: string;
  ext: string;
}) {
  const { supabase, userId, companyId, base64, mime, ext } = params;

  const { data: member } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!member) {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const elevated =
      Boolean((prof as any)?.is_super_admin) ||
      (roles ?? []).some((r: any) => r.role === "admin");
    if (!elevated) throw new Error("You do not have access to this company.");
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength > 8 * 1024 * 1024) {
    throw new Error("Image is too large. Please retake a smaller photo.");
  }

  const path = `${companyId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("card-scans")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path };
}
