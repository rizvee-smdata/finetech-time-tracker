import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects } from "@/lib/tms/queries";
import type { TmsProject } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/tms/EmptyState";
import { Folder, Plus, FolderPlus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

type Visibility = Database["public"]["Enums"]["tms_project_visibility"];
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.data.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ProjectCard({ project }: { project: TmsProject }) {
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

  return (
    <Link to="/tasks/projects/$projectId" params={{ projectId: project.id }}>
      <Card className="p-4 hover:shadow-md transition-shadow h-full">
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
              {project.archived_at && <Badge variant="secondary">Archived</Badge>}
              <Badge variant="outline" className="capitalize text-xs">{project.status}</Badge>
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
      </Card>
    </Link>
  );
}

function ProjectFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [status, setStatus] = useState<Status>("active");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      if (!companyId || !user) throw new Error("No session");
      const { error } = await supabase.from("tms_projects").insert({
        company_id: companyId,
        owner_id: user.id,
        created_by: user.id,
        name: name.trim(),
        description: description.trim() || null,
        color,
        visibility,
        status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created");
      qc.invalidateQueries({ queryKey: ["tms-projects"] });
      setName(""); setDescription("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Color</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="grid gap-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
