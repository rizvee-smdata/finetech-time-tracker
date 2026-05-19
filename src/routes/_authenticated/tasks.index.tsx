import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchTasks } from "@/lib/tms/queries";
import type { TaskWithRels } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/tms/EmptyState";
import { Inbox, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { isOverdue } from "@/lib/tms/utils";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";

export const Route = createFileRoute("/_authenticated/tasks/")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { companyId, user } = useAuth();
  const [editing, setEditing] = useState<TaskWithRels | null>(null);

  const myTasks = useQuery({
    queryKey: ["tms-tasks", "mine", companyId, user?.id],
    enabled: !!companyId && !!user?.id,
    queryFn: () => fetchTasks({ companyId: companyId!, assigneeUserId: user!.id, includeDone: false }),
  });

  const createdByMe = useQuery({
    queryKey: ["tms-tasks", "created", companyId, user?.id],
    enabled: !!companyId && !!user,
    queryFn: () => fetchTasks({ companyId: companyId!, createdByUserId: user!.id, includeDone: false }),
  });

  const buckets = useMemo(() => {
    const tasks = myTasks.data ?? [];
    return {
      overdue: tasks.filter(isOverdue),
      today: tasks.filter((t) => t.due_date && isToday(new Date(t.due_date)) && !isOverdue(t)),
      tomorrow: tasks.filter((t) => t.due_date && isTomorrow(new Date(t.due_date))),
      upcoming: tasks.filter((t) => t.due_date && !isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)) && !isTomorrow(new Date(t.due_date))),
      noDate: tasks.filter((t) => !t.due_date),
    };
  }, [myTasks.data]);

  const stats = [
    { label: "Open tasks", value: myTasks.data?.length ?? 0, icon: Inbox, color: "text-blue-500" },
    { label: "Overdue", value: buckets.overdue.length, icon: AlertTriangle, color: "text-red-500" },
    { label: "Due today", value: buckets.today.length, icon: Clock, color: "text-amber-500" },
    { label: "Created by me", value: createdByMe.data?.length ?? 0, icon: CheckCircle2, color: "text-green-500" },
  ];

  if (!companyId) {
    return <EmptyState icon={Inbox} title="No company selected" description="Pick a company from the sidebar to see tasks." />;
  }
  if (myTasks.isLoading) {
    return <div className="grid gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <s.icon className={`size-5 ${s.color}`} />
              </div>
              <div>
                <div className="text-2xl font-semibold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Section title="Overdue" tasks={buckets.overdue} onEdit={setEditing} accent="text-red-600" />
      <Section title="Due today" tasks={buckets.today} onEdit={setEditing} accent="text-amber-600" />
      <Section title="Tomorrow" tasks={buckets.tomorrow} onEdit={setEditing} />
      <Section title="Upcoming" tasks={buckets.upcoming} onEdit={setEditing} />
      <Section title="No due date" tasks={buckets.noDate} onEdit={setEditing} />

      {(myTasks.data ?? []).length === 0 && (
        <EmptyState icon={Inbox} title="Nothing assigned to you" description="When someone assigns you a task it'll show up here." />
      )}

      <TaskFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} editing={editing} />
    </div>
  );
}

function Section({
  title,
  tasks,
  accent,
  onEdit,
}: {
  title: string;
  tasks: TaskWithRels[];
  accent?: string;
  onEdit: (t: TaskWithRels) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className={`text-sm font-semibold ${accent ?? "text-muted-foreground"}`}>
        {title} <span className="text-muted-foreground">({tasks.length})</span>
      </h3>
      <Card className="divide-y">
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => onEdit(t)}
            className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
          >
            <div
              className="size-2 rounded-full shrink-0"
              style={{ background: t.tms_task_statuses?.color ?? "#94a3b8" }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{t.title}</div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                {t.tms_projects && <span>{t.tms_projects.name}</span>}
                {t.due_date && <span>· Due {format(new Date(t.due_date), "MMM d")}</span>}
              </div>
            </div>
            <PriorityBadge priority={t.priority} />
            <AssigneeAvatars
              size="xs"
              people={t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)}
            />
            <Link
              to="/tasks/$taskId"
              params={{ taskId: t.id }}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open
            </Link>
          </button>
        ))}
      </Card>
    </div>
  );
}
