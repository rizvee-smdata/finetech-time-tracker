import { supabase } from "@/integrations/supabase/client";
import type { TaskWithRels } from "./types";

const TASK_SELECT = `
  *,
  tms_task_statuses(id, name, color, is_terminal),
  tms_projects(id, name, color),
  crm_leads(id, customer_name, company_name),
  tms_task_assignees(
    user_id, role,
    profiles:user_id(id, full_name, avatar_url)
  )
`;


export async function fetchTasks(params: {
  companyId: string;
  projectId?: string | null;
  sprintId?: string | null;
  assigneeUserId?: string | null;
  createdByUserId?: string | null;
  statusId?: string | null;
  priority?: string | null;
  search?: string | null;
  includeDone?: boolean;
}): Promise<TaskWithRels[]> {
  let q = supabase
    .from("tms_tasks")
    .select(TASK_SELECT)
    .eq("company_id", params.companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (params.projectId) q = q.eq("project_id", params.projectId);
  if (params.sprintId) q = q.eq("sprint_id", params.sprintId);
  if (params.statusId) q = q.eq("status_id", params.statusId);
  if (params.priority) q = q.eq("priority", params.priority as "low");
  if (params.createdByUserId) q = q.eq("created_by", params.createdByUserId);
  if (params.search) q = q.ilike("title", `%${params.search}%`);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as unknown as TaskWithRels[];

  if (params.assigneeUserId) {
    rows = rows.filter((r) =>
      r.tms_task_assignees.some((a) => a.user_id === params.assigneeUserId),
    );
  }
  if (!params.includeDone) {
    rows = rows.filter((r) => !r.tms_task_statuses?.is_terminal);
  }
  return rows;
}

export async function fetchStatuses(companyId: string, projectId?: string | null) {
  const { data, error } = await supabase
    .from("tms_task_statuses")
    .select("*")
    .eq("company_id", companyId)
    .or(projectId ? `project_id.is.null,project_id.eq.${projectId}` : "project_id.is.null")
    .order("sort_order");
  if (error) throw error;
  const byName = new Map<string, (typeof data)[number]>();
  for (const s of data ?? []) {
    const existing = byName.get(s.name);
    if (!existing || (s.project_id && !existing.project_id)) byName.set(s.name, s);
  }
  return Array.from(byName.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchProjects(companyId: string, includeArchived = false) {
  let q = supabase
    .from("tms_projects")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Members of the active company, queried via company_members → profiles.
 *  Fetches profiles in a second query (rather than an embedded join) so RLS
 *  on `profiles` cannot silently collapse the join to null rows and leave the
 *  Assignee picker empty. */
export async function fetchCompanyMembers(companyId: string) {
  const { data: mem, error } = await supabase
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);
  if (error) throw error;
  const ids = (mem ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  if (!ids.length) return [] as { id: string; full_name: string | null; avatar_url: string | null; email: string | null }[];
  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, email, is_super_admin")
    .in("id", ids);
  if (profErr) throw profErr;
  return (profs ?? [])
    .filter((p: any) => !p.is_super_admin)
    .map(({ id, full_name, avatar_url, email }: any) => ({ id, full_name, avatar_url, email }))
    .sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));
}

/** Toggle a task between its terminal ("Done") status and the first open status.
 *  Prefers project-scoped statuses, falling back to the company defaults. */
export async function setTaskDone(
  task: { id: string; company_id: string; project_id?: string | null; status_id?: string | null },
  done: boolean,
) {
  const statuses = await fetchStatuses(task.company_id, task.project_id ?? null);
  const target = done
    ? statuses.find((s) => s.is_terminal)
    : statuses.find((s) => !s.is_terminal);
  if (!target) throw new Error(done ? "No 'Done' status configured" : "No open status configured");
  const { error } = await supabase
    .from("tms_tasks")
    .update({ status_id: target.id })
    .eq("id", task.id);
  if (error) throw error;
  return target;
}
