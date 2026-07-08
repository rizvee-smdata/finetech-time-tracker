
# Form Customization Framework

Admins get one central **Form Builder** to reshape every major form in the app — rename labels, hide fields, reorder them, and add unlimited custom fields per company. Built-in columns are never dropped, so reports, AI insights, imports, exports, and automations keep working.

## What admins can do

Per entity (Leads, Customers, Visits, Expenses, Tasks, Contracts):

- **Rename** any built-in field's label (e.g. "Customer Name" → "Client")
- **Hide** built-in fields that aren't relevant (they stay in DB, just not shown)
- **Reorder** fields via drag-and-drop
- **Mark required / optional** (overrides default, within safe limits — truly required system fields like `customer_name` stay required)
- **Add custom fields** of these types:
  - Text (single-line, multi-line)
  - Number
  - Dropdown (single choice, admin defines options)
  - Multi-select (admin defines options)
  - Date
  - Date + time
  - Checkbox / toggle
  - File upload (stored in a private bucket, scoped per company)
  - User picker (team member from same company)
- **Group** fields into sections/tabs with custom headings
- **Preview** the resulting form before saving

## What stays locked (for safety)

- Built-in fields are never deleted from the database — only hidden
- A short list of "system-critical" fields per entity can't be hidden (e.g. Lead's `customer_name`, `stage`; Expense's `amount`, `category`). Attempting to hide shows a tooltip explaining why.
- Field keys (internal identifiers) can't be edited after creation — only labels

## Where admins access it

New **Settings → Form Builder** page with an entity picker at the top (Leads / Customers / Visits / Expenses / Tasks / Contracts). Each entity opens its own builder.

## Technical section

### Data model

Extend the existing `crm_custom_field_defs` pattern into a generic table:

```
form_field_defs
├── id, company_id, entity ('lead' | 'customer' | 'visit' | 'expense' | 'task' | 'contract')
├── field_key (slug, unique per company+entity)
├── field_kind ('builtin' | 'custom')
├── field_type ('text' | 'textarea' | 'number' | 'select' | 'multiselect'
│                | 'date' | 'datetime' | 'boolean' | 'file' | 'user')
├── label (admin-editable display name)
├── options jsonb  (for select/multiselect: [{value,label}])
├── is_hidden, is_required_override, sort_order
├── section (optional group heading)
└── is_system_locked (built-in fields we forbid hiding)
```

Seed one `builtin` row per built-in field per company on first access, so admins see the full form and can rename/hide/reorder in one place.

```
form_field_values          -- stores custom field data
├── id, company_id, entity, entity_id (uuid of the lead/customer/etc.)
├── field_def_id → form_field_defs.id
└── value jsonb  (typed by field_type)

form_field_files           -- for file-type fields
├── id, value_id → form_field_values.id
├── storage_path, file_name, mime_type, size_bytes
```

RLS: all rows scoped to `company_id`; admins manage defs, members read defs and read/write their own values (mirroring parent entity's RLS).

Storage: new private bucket `form-uploads` with policies scoped by `company_id/entity/entity_id/`.

### UI components

- `src/routes/_authenticated/settings.form-builder.tsx` — entity picker + builder canvas
- `src/components/form-builder/FieldList.tsx` — dnd-kit list (rename, toggle hidden, reorder, edit options)
- `src/components/form-builder/AddFieldDialog.tsx` — pick type, label, options
- `src/components/form-builder/FormPreview.tsx` — live render using the same renderer
- `src/components/form-builder/DynamicFormFields.tsx` — the renderer used by every entity's create/edit dialog. Renders both built-in fields (in the order/labels admins chose) and custom fields.

Each existing form (LeadFormDialog, ExpenseForm, TaskFormDialog, VisitCheckin form, etc.) is refactored to delegate its field layout to `DynamicFormFields`, keeping their existing submit logic. Built-in fields stay bound to their real columns; custom values are saved to `form_field_values` in the same transaction.

### Hooks & helpers

- `useFormSchema(entity)` — fetches defs, merges with built-in registry, returns ordered/filtered field list
- `useFormValues(entity, entityId)` — fetches custom values for a record
- `saveCustomFieldValues(entity, entityId, values)` — upsert on submit
- Built-in field registry per entity (`src/lib/form-builder/registry.ts`) declares which columns exist, their type, and which are system-locked

### Rollout order

1. Migration: `form_field_defs`, `form_field_values`, `form_field_files`, `form-uploads` bucket, RLS, seeding function
2. Registry + `useFormSchema` + `DynamicFormFields` renderer
3. Settings → Form Builder page with entity picker (Leads first)
4. Refactor `LeadFormDialog` to use `DynamicFormFields`
5. Roll out entity-by-entity: Customers → Visits → Expenses → Tasks → Contracts
6. Add "Custom fields" columns to list views (opt-in, admin-configurable)

### Compatibility

- Existing `crm_custom_field_defs` data is migrated into `form_field_defs` with `entity='lead'` so nothing is lost.
- Reports, AI, imports, exports keep reading real columns for built-ins; they gain access to custom values via a generated view per entity.

## Scope note

This is a substantial build — roughly 6 entities × (renderer + refactor) plus the shared framework. If you'd like, I can ship it in phases and start with **Leads + framework** this turn, then tackle the other entities in follow-up turns. Reply "start with leads" or "do everything" and I'll proceed.
