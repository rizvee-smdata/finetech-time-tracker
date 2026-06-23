import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CrmOem = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchOems(companyId: string): Promise<CrmOem[]> {
  const { data, error } = await sb
    .from("crm_oems")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as CrmOem[];
}
