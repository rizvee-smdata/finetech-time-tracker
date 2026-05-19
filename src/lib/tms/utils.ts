import type { TaskWithRels, AssigneeProfile } from "./types";

export function personName(p: AssigneeProfile | null | undefined) {
  if (!p) return "Unassigned";
  return (p.full_name ?? "").trim() || "Unassigned";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function isOverdue(t: TaskWithRels) {
  if (!t.due_date) return false;
  if (t.tms_task_statuses?.is_terminal) return false;
  return new Date(t.due_date) < new Date(new Date().toDateString());
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
