import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchTasks } from "@/lib/tms/queries";
import type { TaskWithRels } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";

export const Route = createFileRoute("/_authenticated/tasks/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { companyId } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<TaskWithRels | null>(null);

  const tasks = useQuery({
    queryKey: ["tms-tasks", "calendar", companyId],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, includeDone: true }),
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const arr: Date[] = [];
    let d = start;
    while (d <= end) { arr.push(d); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
    return arr;
  }, [cursor]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, TaskWithRels[]>();
    for (const t of tasks.data ?? []) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [tasks.data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{format(cursor, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCursor(subMonths(cursor, 1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-2 py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dayTasks = tasksByDay.get(key) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const today = isSameDay(d, new Date());
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[110px] border-b border-r p-1.5 space-y-1",
                  !inMonth && "bg-muted/20",
                  today && "bg-primary/5",
                )}
              >
                <div className={cn("text-[11px] font-medium", today && "text-primary")}>
                  {format(d, "d")}
                </div>
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setEditing(t)}
                    className="w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate hover:bg-muted"
                    style={{ background: (t.tms_task_statuses?.color ?? "#94a3b8") + "22" }}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <Link to="/tasks/list" className="block text-[10px] text-primary hover:underline">
                    +{dayTasks.length - 3} more
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {editing && (
        <Card className="p-3 flex items-center gap-3">
          <PriorityBadge priority={editing.priority} />
          <span className="font-medium">{editing.title}</span>
          <Link to="/tasks/$taskId" params={{ taskId: editing.id }} className="text-sm text-primary hover:underline ml-auto">
            Open
          </Link>
          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Close</Button>
        </Card>
      )}

      <TaskFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} editing={editing} />
    </div>
  );
}
