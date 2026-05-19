import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchStatuses, fetchTasks } from "@/lib/tms/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft } from "lucide-react";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { TaskQuickAdd } from "@/components/tms/TaskQuickAdd";

export const Route = createFileRoute("/_authenticated/tasks/projects/$projectId/sprints/$sprintId")({
  component: SprintBoardPage,
});

function SprintBoardPage() {
  const { projectId, sprintId } = useParams({ from: "/_authenticated/tasks/projects/$projectId/sprints/$sprintId" });
  const { companyId } = useAuth();

  const sprint = useQuery({
    queryKey: ["tms-sprint", sprintId],
    enabled: !!sprintId,
    queryFn: async () => {
      const { data, error } = await supabase.from("tms_sprints").select("*").eq("id", sprintId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const statuses = useQuery({
    queryKey: ["tms-statuses", companyId, projectId],
    enabled: !!companyId,
    queryFn: () => fetchStatuses(companyId!, projectId),
  });

  const tasks = useQuery({
    queryKey: ["tms-tasks", "sprint", sprintId],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, sprintId, includeDone: true }),
  });

  if (sprint.isLoading) return <Skeleton className="h-64" />;
  if (!sprint.data) return <div>Sprint not found.</div>;

  const grouped = (statuses.data ?? []).map((s) => ({
    status: s,
    items: (tasks.data ?? []).filter((t) => t.status_id === s.id),
  }));

  return (
    <div className="space-y-4">
      <Link to="/tasks/projects/$projectId" params={{ projectId }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4 mr-1" /> Back to project
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{sprint.data.name}</h1>
        <p className="text-sm text-muted-foreground">
          {sprint.data.start_date} → {sprint.data.end_date}
          {sprint.data.capacity_hours ? ` • capacity ${sprint.data.capacity_hours}h` : ""}
          {sprint.data.closed_at ? " • closed" : ""}
        </p>
        {sprint.data.goal && <p className="text-sm mt-2">{sprint.data.goal}</p>}
      </div>

      <TaskQuickAdd
        projectId={projectId}
        sprintId={sprintId}
        invalidateKeys={[["tms-tasks", "sprint", sprintId]]}
        placeholder="Add to sprint…"
      />

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {grouped.map((g) => (
          <div key={g.status.id} className="rounded-lg border bg-muted/30 p-2 min-h-[200px]">
            <div className="flex items-center justify-between px-1 mb-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: g.status.color }} />
                <span className="text-sm font-medium">{g.status.name}</span>
              </div>
              <Badge variant="secondary">{g.items.length}</Badge>
            </div>
            <div className="space-y-2">
              {g.items.map((t) => (
                <Link key={t.id} to="/tasks/$taskId" params={{ taskId: t.id }}>
                  <Card className="p-3 hover:shadow-sm transition-shadow space-y-2">
                    <div className="text-sm font-medium leading-snug">{t.title}</div>
                    <div className="flex items-center justify-between">
                      <PriorityBadge priority={t.priority} />
                      <AssigneeAvatars size="xs" people={t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
