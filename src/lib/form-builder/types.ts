export type FormEntity =
  | "lead"
  | "customer"
  | "visit"
  | "expense"
  | "task"
  | "contract";

export type FormFieldKind = "builtin" | "custom";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "boolean"
  | "file"
  | "user";

export type FormFieldOption = { value: string; label: string };

export type FormFieldDef = {
  id: string;
  company_id: string;
  entity: FormEntity;
  field_key: string;
  field_kind: FormFieldKind;
  field_type: FormFieldType;
  label: string;
  help_text: string | null;
  placeholder: string | null;
  options: FormFieldOption[];
  is_hidden: boolean;
  is_required_override: boolean | null;
  is_system_locked: boolean;
  section: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FormFieldValue = {
  id: string;
  company_id: string;
  entity: FormEntity;
  entity_id: string;
  field_def_id: string;
  value: unknown;
  created_at: string;
  updated_at: string;
};

export type FormFieldFile = {
  id: string;
  value_id: string;
  company_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export const ENTITY_LABELS: Record<FormEntity, string> = {
  lead: "Leads",
  customer: "Customers",
  visit: "Visits",
  expense: "Expenses",
  task: "Tasks",
  contract: "Contracts",
};

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Single-line text",
  textarea: "Long text",
  number: "Number",
  select: "Dropdown",
  multiselect: "Multi-select",
  date: "Date",
  datetime: "Date & time",
  boolean: "Checkbox",
  file: "File upload",
  user: "Team member",
};
