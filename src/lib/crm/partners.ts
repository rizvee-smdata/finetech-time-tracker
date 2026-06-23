import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CrmPartner = {
  id: string;
  name: string;
};

/**
 * Partners are stored in the shared `customers` table with kind = 'partner'.
 * (Same source as the "Partners" page in the left menu.)
 */
export async function fetchPartners(companyId: string): Promise<CrmPartner[]> {
  const { data, error } = await sb
    .from("customers")
    .select("id, customer_name, created_at")
    .eq("company_id", companyId)
    .eq("kind", "partner")
    .is("deleted_at", null)
    .order("customer_name")
    .order("created_at", { ascending: true });
  if (error) throw error;
  // Dedupe by normalized name — the contacts table can contain duplicates from imports.
  const seen = new Set<string>();
  const out: CrmPartner[] = [];
  for (const c of (data ?? []) as Array<{ id: string; customer_name: string }>) {
    const key = (c.customer_name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: c.id, name: c.customer_name });
  }
  return out;
}
