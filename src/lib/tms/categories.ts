export const TASK_CATEGORIES = [
  { value: "visit", label: "Client Visit", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "call", label: "Follow-up Call", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "demo", label: "Demo", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "proposal", label: "Proposal", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "internal", label: "Internal Meeting", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "admin", label: "Admin", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
] as const;

export type TaskCategoryValue = (typeof TASK_CATEGORIES)[number]["value"];

export function categoryMeta(value?: string | null) {
  return TASK_CATEGORIES.find((c) => c.value === value) ?? null;
}
