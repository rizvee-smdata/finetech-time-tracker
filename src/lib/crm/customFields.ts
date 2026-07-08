import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type CustomFieldDef = {
  id: string;
  company_id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number";
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

export async function fetchCustomFieldDefs(companyId: string, opts?: { activeOnly?: boolean }): Promise<CustomFieldDef[]> {
  let q = sb.from("crm_custom_field_defs").select("*").eq("company_id", companyId).order("sort_order").order("created_at");
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustomFieldDef[];
}

export function slugifyKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `field_${Date.now()}`;
}
