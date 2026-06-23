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
    .select("id, customer_name")
    .eq("company_id", companyId)
    .eq("kind", "partner")
    .is("deleted_at", null)
    .order("customer_name");
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.customer_name }));
}
