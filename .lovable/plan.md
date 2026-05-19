## Goal

Port the entire Tasks (TMS) module from peoplenest-pro into this project, adapted to this project's schema (no `employees`, no `departments`, no `tenant_id`).

## Schema mapping

| peoplenest-pro | this project |
|---|---|
| `employees.id` | `profiles.id` (= `auth.users.id`) |
| `tenant_id` (uuid) | `company_id` (uuid) from `company_members` |
| `departments` FK | dropped (column removed) |
| `is_staff` / role helpers | reuse existing `has_role`, `is_staff`, `is_company_member` |

## Phase 1 — Database (one migration)

Create, adapted to this schema:

- Enums: `tms_priority`, `tms_task_type`, `tms_project_status`, `tms_project_visibility`, `tms_project_member_role`, `tms_assignee_role`, `tms_dependency_type`
- Tables (all with `company_id uuid NOT NULL` instead of `tenant_id`, all `employee_id` → `user_id uuid` referencing `auth.users`, no `department_id`):
  - `tms_projects`, `tms_project_members`, `tms_task_statuses`, `tms_milestones`, `tms_sprints`, `tms_labels`
  - `tms_tasks`, `tms_task_assignees`, `tms_task_labels`, `tms_task_dependencies`
  - `tms_task_comments`, `tms_task_attachments`, `tms_task_activity`, `tms_task_watchers`
  - `tms_saved_views`, `tms_notification_prefs`
- Helper SECURITY DEFINER fns: `tms_is_project_member(_user, _project)`, `tms_can_view_task(_user, _task)`
- RLS on every table: visible to admin OR same-company member; insert/update/delete restricted to assignees / project members / staff
- `updated_at` triggers via existing `set_updated_at`
- Seed default statuses (Todo, In Progress, In Review, Done) per company on first project create via trigger

## Phase 2 — Lib layer (`src/lib/tms/`)

Copy and adapt: `types.ts`, `queries.ts`, `saved-views.ts`, `utils.ts`. Replace every `tenant_id` with `company_id`, every `employee_id` with `user_id`, drop department code paths.

## Phase 3 — Components (`src/components/tms/`)

Copy adapted: `AssigneeAvatars`, `PriorityBadge`, `TaskFormDialog`, `TaskQuickAdd`, `TaskCommandPalette`, `NotificationPrefsTab`. Drop `AssigneeLeaveWarning` (no leave system here).

## Phase 4 — Routes (`src/routes/_authenticated/tasks*`)

Port all 12 task routes: `tasks.tsx` (layout), `tasks.index.tsx`, `tasks.list.tsx`, `tasks.board.tsx`, `tasks.calendar.tsx`, `tasks.gantt.tsx`, `tasks.reports.tsx`, `tasks.projects.tsx`, `tasks.projects.$projectId.tsx`, `tasks.projects.$projectId.sprints.$sprintId.tsx`, `tasks.$taskId.tsx`. Adapt all queries to use `company_id` from the current user's `company_members` row.

## Phase 5 — Cron route

Port `src/routes/api/public/hooks/tms-overdue-scan.ts` — scans overdue tasks, inserts into `reminders` table (already exists here). Add `pg_cron` schedule via `supabase--insert` after the route is live.

## Phase 6 — Nav

Add a "Tasks" link to `AppShell.tsx`.

## Out of scope (flagged)

- `AssigneeLeaveWarning` — depends on a leaves table that doesn't exist
- Department filtering UI — removed
- Anything that imports from `employees.$employeeId.tsx` etc.

## Risk / size

~25 files, ~600-line SQL migration. Expect 4–6 build/lint passes to settle type errors after `types.ts` regenerates from the migration. I'll batch reads/writes aggressively but this will take multiple turns.

## Confirm before I start

Approve this plan and I'll begin with the migration (Phase 1) — that has to land and types regenerate before the lib/components compile cleanly.