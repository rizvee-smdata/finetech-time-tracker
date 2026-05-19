import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchCompanyMembers, fetchTasks } from "@/lib/tms/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCsv, isOverdue } from "@/lib/tms/utils";

export const Route = createFileRoute("/_authenticated/tasks/reports")({
  component: TasksReports,
});

function TasksReports() {
  const { companyId } = useAuth();

  const tasks = useQuery({
    queryKey: ["tms-tasks-all", companyId],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, includeDone: true }),
  });

  const members = useQuery({
    queryKey: ["tms-members", companyId],
    enabled: !!companyId,
    queryFn: () => fetchCompanyMembers(companyId!),
  });

  const rows = useMemo(() => {
    const list = tasks.data ?? [];
    const byUser = new Map<string, { name: string; total: number; done: number; overdue: number; est: number; logged: number }>();
    for (const m of members.data ?? []) {
      byUser.set(m.id, { name: (m.full_name ?? "").trim() || "User", total: 0, done: 0, overdue: 0, est: 0, logged: 0 });
    }
    for (const t of list) {
      for (const a of t.tms_task_assignees) {
        const k = a.user_id;
        if (!byUser.has(k)) byUser.set(k, { name: (a.profiles?.full_name ?? "").trim() || "User", total: 0, done: 0, overdue: 0, est: 0, logged: 0 });
        const r = byUser.get(k)!;
        r.total += 1;
        if (t.tms_task_statuses?.is_terminal) r.done += 1;
        if (isOverdue(t)) r.overdue += 1;
        r.est += Number(t.estimated_hours ?? 0);
        r.logged += Number(t.logged_hours ?? 0);
      }
    }
    return Array.from(byUser.entries()).map(([user_id, r]) => ({
      user_id,
      employee_name: r.name,
      total_tasks: r.total,
      completed_tasks: r.done,
      overdue_tasks: r.overdue,
      completion_rate_pct: r.total ? Math.round((100 * r.done) / r.total) : null,
      overdue_rate_pct: r.total ? Math.round((100 * r.overdue) / r.total) : null,
      total_estimated_hours: r.est,
      total_logged_hours: r.logged,
      hours_efficiency_pct: r.est > 0 ? Math.round((100 * r.logged) / r.est) : null,
    })).sort((a, b) => b.total_tasks - a.total_tasks);
  }, [tasks.data, members.data]);

  const totals = rows.reduce(
    (a, r) => ({
      total: a.total + r.total_tasks,
      done: a.done + r.completed_tasks,
      overdue: a.overdue + r.overdue_tasks,
    }),
    { total: 0, done: 0, overdue: 0 },
  );
  const overallCompletion = totals.total ? Math.round((100 * totals.done) / totals.total) : 0;

  const projectProgress = useQuery({
    queryKey: ["tms-proj-progress", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tms_projects")
        .select("id, name, status, tms_tasks(id, status_id, tms_task_statuses(is_terminal))")
        .eq("company_id", companyId!)
        .is("archived_at", null);
      if (error) throw error;
      return (data ?? []).map((p) => {
        const total = p.tms_tasks?.length ?? 0;
        const done =
          p.tms_tasks?.filter((t: { tms_task_statuses: { is_terminal: boolean } | null }) =>
            t.tms_task_statuses?.is_terminal,
          ).length ?? 0;
        return { id: p.id, name: p.name, status: p.status, total, done, pct: total ? Math.round((100 * done) / total) : 0 };
      });
    },
  });

  function exportCsv() {
    downloadCsv(
      "task-member-metrics.csv",
      rows.map((r) => ({
        Member: r.employee_name,
        "Total tasks": r.total_tasks,
        Completed: r.completed_tasks,
        Overdue: r.overdue_tasks,
        "Completion %": r.completion_rate_pct ?? "",
        "Overdue %": r.overdue_rate_pct ?? "",
        "Est hrs": r.total_estimated_hours,
        "Logged hrs": r.total_logged_hours,
        "Efficiency %": r.hours_efficiency_pct ?? "",
      })),
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total tasks</div><div className="text-2xl font-semibold">{totals.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-semibold">{totals.done}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-2xl font-semibold text-red-600">{totals.overdue}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Completion rate</div><div className="text-2xl font-semibold">{overallCompletion}%</div></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Workload &amp; performance by member</h2>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4 mr-1" /> Export CSV
          </Button>
        </div>
        {tasks.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Done</th>
                  <th className="py-2 pr-3">Overdue</th>
                  <th className="py-2 pr-3">Completion</th>
                  <th className="py-2 pr-3">Est / Logged hrs</th>
                  <th className="py-2 pr-3">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.employee_name}</td>
                    <td className="py-2 pr-3">{r.total_tasks}</td>
                    <td className="py-2 pr-3">{r.completed_tasks}</td>
                    <td className="py-2 pr-3">{r.overdue_tasks}</td>
                    <td className="py-2 pr-3">{r.completion_rate_pct ?? "—"}%</td>
                    <td className="py-2 pr-3">
                      {Number(r.total_estimated_hours).toFixed(1)} / {Number(r.total_logged_hours).toFixed(1)}
                    </td>
                    <td className="py-2 pr-3">{r.hours_efficiency_pct ?? "—"}%</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Project progress</h2>
        {projectProgress.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-3">
            {(projectProgress.data ?? []).map((p) => (
              <div key={p.id}>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                  <span className="text-muted-foreground">{p.done}/{p.total} • {p.pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded mt-1 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            ))}
            {!(projectProgress.data ?? []).length && (
              <div className="text-sm text-muted-foreground">No active projects.</div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
