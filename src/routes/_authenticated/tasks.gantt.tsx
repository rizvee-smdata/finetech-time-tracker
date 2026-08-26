import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects, fetchTasks } from "@/lib/tms/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GanttChart } from "@/components/tms/GanttChart";

export const Route = createFileRoute("/_authenticated/tasks/gantt")({
  component: GanttPage,
});

function GanttPage() {
  const { companyId } = useAuth();
  const [projectId, setProjectId] = useState<string>("all");
  const [includeDone, setIncludeDone] = useState(true);

  const projects = useQuery({
    queryKey: ["tms-projects-all", companyId],
    enabled: !!companyId,
    queryFn: () => fetchProjects(companyId!, false),
  });

  const tasks = useQuery({
    queryKey: ["tms-tasks-gantt", companyId, projectId, includeDone],
    enabled: !!companyId,
    queryFn: () =>
      fetchTasks({
        companyId: companyId!,
        projectId: projectId === "all" ? null : projectId,
        includeDone,
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="gantt-done" checked={includeDone} onCheckedChange={setIncludeDone} />
          <Label htmlFor="gantt-done" className="text-xs">Show completed</Label>
        </div>
      </div>

      {tasks.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <GanttChart tasks={tasks.data ?? []} groupByProject={projectId === "all"} />
      )}
    </div>
  );
}
