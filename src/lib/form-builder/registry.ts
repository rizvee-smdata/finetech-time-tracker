import type { FormEntity, FormFieldType } from "./types";

/** Built-in field seed for each entity. Rendered as pseudo-defs so admins can
 *  rename, hide, and reorder them alongside custom fields, without touching
 *  the underlying database columns. */
export type BuiltinField = {
  key: string;
  label: string;
  type: FormFieldType;
  section?: string;
  /** true = admin cannot hide this field, only rename it. */
  system_locked?: boolean;
  /** default sort order within the entity's built-ins. */
  order: number;
};

export const BUILTIN_FIELDS: Record<FormEntity, BuiltinField[]> = {
  lead: [
    { key: "customer_name", label: "Customer Name", type: "text", section: "Basics", system_locked: true, order: 10 },
    { key: "company_name", label: "Company", type: "text", section: "Basics", order: 20 },
    { key: "contact_person", label: "Contact Person", type: "text", section: "Basics", order: 30 },
    { key: "designation", label: "Designation", type: "text", section: "Basics", order: 40 },
    { key: "phone", label: "Phone", type: "text", section: "Basics", order: 50 },
    { key: "email", label: "Email", type: "text", section: "Basics", order: 60 },
    { key: "location", label: "Location", type: "text", section: "Basics", order: 70 },
    { key: "stage", label: "Stage", type: "select", section: "Pipeline", system_locked: true, order: 110 },
    { key: "priority", label: "Priority", type: "select", section: "Pipeline", order: 120 },
    { key: "lead_source", label: "Lead Source", type: "select", section: "Pipeline", order: 130 },
    { key: "expected_value", label: "Expected Value", type: "number", section: "Pipeline", order: 140 },
    { key: "currency", label: "Currency", type: "select", section: "Pipeline", order: 150 },
    { key: "probability", label: "Probability %", type: "number", section: "Pipeline", order: 160 },
    { key: "expected_close_date", label: "Expected Close Date", type: "date", section: "Pipeline", order: 170 },
    { key: "assigned_to", label: "Assigned To", type: "user", section: "Ownership", order: 210 },
    { key: "notes", label: "Notes", type: "textarea", section: "Notes", order: 310 },
  ],
  customer: [
    { key: "customer_name", label: "Customer Name", type: "text", section: "Basics", system_locked: true, order: 10 },
    { key: "company_name", label: "Company", type: "text", section: "Basics", order: 20 },
    { key: "contact_person", label: "Contact Person", type: "text", section: "Basics", order: 30 },
    { key: "phone", label: "Phone", type: "text", section: "Basics", order: 40 },
    { key: "email", label: "Email", type: "text", section: "Basics", order: 50 },
    { key: "address", label: "Address", type: "textarea", section: "Basics", order: 60 },
    { key: "tier", label: "Tier", type: "select", section: "Classification", order: 110 },
    { key: "assigned_rep_id", label: "Assigned Rep", type: "user", section: "Ownership", order: 210 },
  ],
  visit: [
    { key: "customer_id", label: "Customer", type: "select", section: "Basics", system_locked: true, order: 10 },
    { key: "meeting_at", label: "Meeting Date & Time", type: "datetime", section: "Basics", system_locked: true, order: 20 },
    { key: "purpose", label: "Purpose", type: "text", section: "Basics", order: 30 },
    { key: "discussion_summary", label: "Discussion Notes", type: "textarea", section: "Outcome", order: 40 },
    { key: "next_action", label: "Next Action", type: "textarea", section: "Outcome", order: 50 },
    { key: "next_visit_date", label: "Next Visit Date", type: "date", section: "Outcome", order: 60 },
  ],
  expense: [
    { key: "expense_date", label: "Date", type: "date", section: "Basics", system_locked: true, order: 10 },
    { key: "category_id", label: "Category", type: "select", section: "Basics", system_locked: true, order: 20 },
    { key: "amount", label: "Amount", type: "number", section: "Basics", system_locked: true, order: 30 },
    { key: "currency", label: "Currency", type: "select", section: "Basics", order: 40 },
    { key: "description", label: "Description", type: "textarea", section: "Details", order: 50 },
    { key: "vendor", label: "Vendor / Merchant", type: "text", section: "Details", order: 60 },
    { key: "receipt_url", label: "Receipt", type: "file", section: "Details", order: 70 },
  ],
  task: [
    { key: "title", label: "Title", type: "text", section: "Basics", system_locked: true, order: 10 },
    { key: "description", label: "Description", type: "textarea", section: "Basics", order: 20 },
    { key: "status_id", label: "Status", type: "select", section: "Progress", system_locked: true, order: 30 },
    { key: "priority", label: "Priority", type: "select", section: "Progress", order: 40 },
    { key: "due_date", label: "Due Date", type: "date", section: "Progress", order: 50 },
    { key: "assignees", label: "Assignees", type: "user", section: "People", order: 60 },
    { key: "project_id", label: "Project", type: "select", section: "Context", order: 70 },
  ],
  contract: [
    { key: "title", label: "Title", type: "text", section: "Basics", system_locked: true, order: 10 },
    { key: "customer_id", label: "Customer", type: "select", section: "Basics", system_locked: true, order: 20 },
    { key: "start_date", label: "Start Date", type: "date", section: "Term", order: 30 },
    { key: "end_date", label: "End Date", type: "date", section: "Term", order: 40 },
    { key: "value", label: "Contract Value", type: "number", section: "Financial", order: 50 },
    { key: "currency", label: "Currency", type: "select", section: "Financial", order: 60 },
    { key: "status", label: "Status", type: "select", section: "Status", order: 70 },
    { key: "notes", label: "Notes", type: "textarea", section: "Notes", order: 80 },
  ],
};
