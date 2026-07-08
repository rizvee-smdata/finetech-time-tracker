import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_FIELDS } from "./registry";
import type { FormEntity, FormFieldDef, FormFieldOption } from "./types";

const sb = supabase as any;

export function slugifyKey(label: string) {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || `field_${Date.now()}`
  );
}

/** Fetch all field defs for an entity, seeding built-ins on first access. */
export async function fetchFieldDefs(
  companyId: string,
  entity: FormEntity,
): Promise<FormFieldDef[]> {
  const { data, error } = await sb
    .from("form_field_defs")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity", entity)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const existing = (data ?? []) as FormFieldDef[];
  const existingKeys = new Set(existing.filter((d) => d.field_kind === "builtin").map((d) => d.field_key));
  const missing = BUILTIN_FIELDS[entity].filter((b) => !existingKeys.has(b.key));

  if (missing.length > 0) {
    const rows = missing.map((b) => ({
      company_id: companyId,
      entity,
      field_key: b.key,
      field_kind: "builtin" as const,
      field_type: b.type,
      label: b.label,
      section: b.section ?? null,
      sort_order: b.order,
      is_system_locked: !!b.system_locked,
      options: [],
    }));
    const { data: seeded, error: e2 } = await sb.from("form_field_defs").insert(rows).select("*");
    if (e2) throw e2;
    return [...existing, ...((seeded ?? []) as FormFieldDef[])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }
  return existing;
}

export async function createCustomField(input: {
  companyId: string;
  entity: FormEntity;
  label: string;
  type: FormFieldDef["field_type"];
  options?: FormFieldOption[];
  helpText?: string;
  placeholder?: string;
  section?: string | null;
}) {
  const key = slugifyKey(input.label);
  const { data, error } = await sb
    .from("form_field_defs")
    .insert({
      company_id: input.companyId,
      entity: input.entity,
      field_key: `custom_${key}`,
      field_kind: "custom",
      field_type: input.type,
      label: input.label,
      help_text: input.helpText ?? null,
      placeholder: input.placeholder ?? null,
      options: input.options ?? [],
      section: input.section ?? "Custom",
      sort_order: 9999,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FormFieldDef;
}

export async function updateFieldDef(id: string, patch: Partial<FormFieldDef>) {
  const { data, error } = await sb.from("form_field_defs").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as FormFieldDef;
}

export async function deleteCustomField(id: string) {
  const { error } = await sb.from("form_field_defs").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderFields(orderedIds: string[]) {
  // Assign sort_order based on array index (10, 20, 30…)
  await Promise.all(
    orderedIds.map((id, i) =>
      sb.from("form_field_defs").update({ sort_order: (i + 1) * 10 }).eq("id", id),
    ),
  );
}
