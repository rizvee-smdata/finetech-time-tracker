import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects } from "@/lib/tms/queries";
import type { TmsProject } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/tms/EmptyState";
import { Folder, Plus, FolderPlus, Pencil, CheckCircle2, RotateCcw } from "lucide-react";
import { ProjectFormDialog } from "@/components/tms/ProjectFormDialog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

type Status = Database["public"]["Enums"]["tms_project_status"];

export const Route = createFileRoute("/_authenticated/tasks/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { companyId } = useAuth();
  const [open, setOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["tms-projects", companyId, "all"],
    enabled: !!companyId,
    queryFn: () => fetchProjects(companyId!, true),
  });

  const pg = usePagination(projects.data ?? [], 20);


  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> New project</Button>
      </div>

      {projects.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !projects.data?.length ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Group related tasks under projects with sprints, milestones and dedicated boards."
          action={<Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> Create project</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pg.paged.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
          <PaginationBar {...pg} label="projects" />
        </>
      )}

      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ProjectCard({ project }: { project: TmsProject }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const p = project as TmsProject & { project_type?: string | null };

  const stats = useQuery({
    queryKey: ["tms-project-stats", project.id],
    queryFn: async () => {
      const { count: total } = await supabase
        .from("tms_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id)
        .is("deleted_at", null);
      return { total: total ?? 0 };
    },
  });

  const closeProject = useMutation({
    mutationFn: async (reopen: boolean) => {
      const { error } = await supabase
        .from("tms_projects")
        .update(
          reopen
            ? { status: "active" as Status, archived_at: null }
            : { status: "completed" as Status, archived_at: new Date().toISOString() },
        )
        .eq("id", project.id);
      if (error) throw error;
    },
    onSuccess: (_d, reopen) => {
      toast.success(reopen ? "Project reopened" : "Project closed");
      qc.invalidateQueries({ queryKey: ["tms-projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isClosed = !!project.archived_at || project.status === "completed";

  return (
    <>
      <Card className="p-4 hover:shadow-md transition-shadow h-full flex flex-col">
        <Link to="/tasks/projects/$projectId" params={{ projectId: project.id }} className="flex-1">
          <div className="flex items-start gap-3">
            <div
              className="size-10 rounded-lg flex items-center justify-center text-lg shrink-0"
              style={{ background: (project.color ?? "#6366f1") + "22", color: project.color ?? "#6366f1" }}
            >
              <Folder className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{project.name}</h3>
                {project.archived_at && <Badge variant="secondary">Closed</Badge>}
                <Badge variant="outline" className="capitalize text-xs">{project.status}</Badge>
                {p.project_type && <Badge variant="secondary" className="capitalize text-xs">{p.project_type}</Badge>}
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{stats.data?.total ?? 0} tasks</span>
                <span className="capitalize">· {project.visibility}</span>
              </div>
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2 pt-3 mt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5 mr-1" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={closeProject.isPending}
            onClick={() => closeProject.mutate(isClosed)}
          >
            {isClosed ? <RotateCcw className="size-3.5 mr-1" /> : <CheckCircle2 className="size-3.5 mr-1" />}
            {isClosed ? "Reopen" : "Close"}
          </Button>
        </div>
      </Card>
      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={p as never} />
    </>
  );
}
