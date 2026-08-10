/**
 * Field-level permission catalog and masking helpers (client-safe).
 *
 * A permission profile stores `hidden_fields` / `readonly_fields` as
 * `{ "<entity>": ["<field>", ...] }`. Entities and fields listed here are the
 * ones an admin can toggle in Settings -> Permissions.
 */

export type FieldMap = Record<string, string[]>;

export interface EffectivePermissions {
  profile_id?: string | null;
  profile_name?: string | null;
  record_visibility: "own" | "team" | "company";
  hidden_fields: FieldMap;
  readonly_fields: FieldMap;
  is_admin: boolean;
}

export const DEFAULT_PERMISSIONS: EffectivePermissions = {
  profile_id: null,
  profile_name: null,
  record_visibility: "company",
  hidden_fields: {},
  readonly_fields: {},
  is_admin: false,
};

export interface FieldCatalogEntry {
  entity: string;
  label: string;
  fields: { key: string; label: string }[];
}

export const FIELD_CATALOG: FieldCatalogEntry[] = [
  {
    entity: "crm_leads",
    label: "Deals / Leads",
    fields: [
      { key: "expected_value", label: "Deal value" },
      { key: "probability", label: "Win probability" },
      { key: "expected_close_date", label: "Expected close date" },
      { key: "score", label: "AI score & risk" },
      { key: "competitor", label: "Competitor" },
      { key: "products", label: "Products & OEM" },
    ],
  },
  {
    entity: "crm_quotes",
    label: "Quotes",
    fields: [
      { key: "unit_cost", label: "Unit cost / margin" },
      { key: "discount", label: "Discount" },
      { key: "total", label: "Quote total" },
    ],
  },
  {
    entity: "customers",
    label: "Customers",
    fields: [
      { key: "email", label: "Email address" },
      { key: "phone", label: "Phone number" },
      { key: "annual_revenue", label: "Annual revenue" },
    ],
  },
  {
    entity: "contracts",
    label: "Contracts",
    fields: [
      { key: "value", label: "Contract value" },
      { key: "payment_terms", label: "Payment terms" },
    ],
  },
];

export const RECORD_VISIBILITY_OPTIONS = [
  { value: "own", label: "Own records only", hint: "Sees only records they created or are assigned to." },
  { value: "team", label: "Own + direct reports", hint: "Also sees records owned by people who report to them." },
  { value: "company", label: "Whole company", hint: "Standard access based on their role." },
] as const;

export function isFieldHidden(
  perms: EffectivePermissions | undefined | null,
  entity: string,
  field: string,
): boolean {
  if (!perms || perms.is_admin) return false;
  return (perms.hidden_fields?.[entity] ?? []).includes(field);
}

export function isFieldReadonly(
  perms: EffectivePermissions | undefined | null,
  entity: string,
  field: string,
): boolean {
  if (!perms || perms.is_admin) return false;
  return (perms.readonly_fields?.[entity] ?? []).includes(field);
}

export const MASK = "••••••";

/** Returns the value, or the mask placeholder when the field is hidden. */
export function maskField<T>(
  perms: EffectivePermissions | undefined | null,
  entity: string,
  field: string,
  value: T,
): T | string {
  return isFieldHidden(perms, entity, field) ? MASK : value;
}
