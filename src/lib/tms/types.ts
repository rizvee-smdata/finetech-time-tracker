import type { Database } from "@/integrations/supabase/types";

export type TmsTask = Database["public"]["Tables"]["tms_tasks"]["Row"];
export type TmsTaskInsert = Database["public"]["Tables"]["tms_tasks"]["Insert"];
export type TmsProject = Database["public"]["Tables"]["tms_projects"]["Row"];
export type TmsStatus = Database["public"]["Tables"]["tms_task_statuses"]["Row"];
export type TmsSprint = Database["public"]["Tables"]["tms_sprints"]["Row"];
export type TmsMilestone = Database["public"]["Tables"]["tms_milestones"]["Row"];
export type TmsAssignee = Database["public"]["Tables"]["tms_task_assignees"]["Row"];
export type TmsTimeLog = Database["public"]["Tables"]["tms_time_logs"]["Row"];
export type TmsComment = Database["public"]["Tables"]["tms_task_comments"]["Row"];
export type TmsChecklistItem = Database["public"]["Tables"]["tms_checklist_items"]["Row"];

export type Priority = Database["public"]["Enums"]["tms_priority"];
export type TaskType = Database["public"]["Enums"]["tms_task_type"];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
export const TASK_TYPES: TaskType[] = ["task", "bug", "story", "milestone"];

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export type AssigneeProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type TaskWithRels = TmsTask & {
  tms_task_statuses: { id: string; name: string; color: string; is_terminal: boolean } | null;
  tms_projects: { id: string; name: string; color: string | null } | null;
  tms_task_assignees: Array<{
    user_id: string;
    role: Database["public"]["Enums"]["tms_assignee_role"];
    profiles: AssigneeProfile | null;
  }>;
};
