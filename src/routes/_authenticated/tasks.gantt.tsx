import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects, fetchTasks } from "@/lib/tms/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { differenceInCalendarDays, format, max as maxDate, min as minDate, startOfDay, addDays } from "date-fns";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tasks/gantt")({
  component: GanttPage,
});

function GanttPage() {
  const { companyId } = useAuth();
  const [projectId, setProjectId] = useState<string>("all");

  const projects = useQuery({
    queryKey: ["tms-projects-all", companyId],
    enabled: !!companyId,
    queryFn: () => fetchProjects(companyId!, false),
  });

  const tasks = useQuery({
    queryKey: ["tms-tasks-gantt", companyId, projectId],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, projectId: projectId === "all" ? null : projectId, includeDone: true }),
  });

  const rows = useMemo(() => {
    return (tasks.data ?? [])
      .filter((t) => t.due_date)
      .map((t) => {
        const end = startOfDay(new Date(t.due_date!));
        const created = startOfDay(new Date(t.created_at));
        const start = created < end ? created : end;
        return { task: t, start, end };
      });
  }, [tasks.data]);

  const range = useMemo(() => {
    if (rows.length === 0) return null;
    const start = startOfDay(minDate(rows.map((r) => r.start)));
    const end = startOfDay(maxDate(rows.map((r) => r.end)));
    const days = Math.max(differenceInCalendarDays(end, start) + 1, 14);
    return { start, end: addDays(start, days - 1), days };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {tasks.isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 || !range ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No tasks with start or due dates to display.</Card>
      ) : (
        <Card className="p-3 overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid" style={{ gridTemplateColumns: `220px repeat(${range.days}, minmax(28px, 1fr))` }}>
              <div className="text-xs font-medium text-muted-foreground py-2 sticky left-0 bg-background">Task</div>
              {Array.from({ length: range.days }, (_, i) => {
                const d = addDays(range.start, i);
                return (
                  <div key={i} className="text-[10px] text-muted-foreground text-center py-2 border-l">
                    {format(d, "d")}
                    {(i === 0 || d.getDate() === 1) && <div className="font-medium">{format(d, "MMM")}</div>}
                  </div>
                );
              })}
              {rows.map(({ task, start, end }) => {
                const offset = differenceInCalendarDays(start, range.start);
                const span = differenceInCalendarDays(end, start) + 1;
                return (
                  <div key={task.id} className="contents group">
                    <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="text-sm py-2 truncate sticky left-0 bg-background pr-2 border-t hover:text-primary">
                      {task.title}
                    </Link>
                    {Array.from({ length: range.days }, (_, i) => (
                      <div key={i} className="border-t border-l h-9 relative">
                        {i === offset && (
                          <div
                            className="absolute top-1.5 bottom-1.5 rounded text-[10px] text-white px-2 flex items-center overflow-hidden whitespace-nowrap"
                            style={{
                              left: 0,
                              width: `calc(${span} * 100% + ${(span - 1)}px)`,
                              background: task.tms_task_statuses?.color ?? "#6366f1",
                            }}
                          >
                            {task.title}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
