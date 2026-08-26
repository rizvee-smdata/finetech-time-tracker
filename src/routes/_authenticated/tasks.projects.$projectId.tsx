import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchTasks } from "@/lib/tms/queries";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, Plus, Flag, Repeat, X, GanttChartSquare } from "lucide-react";
import { GanttChart } from "@/components/tms/GanttChart";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tasks/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/_authenticated/tasks/projects/$projectId" });
  const { companyId } = useAuth();

  const project = useQuery({
    queryKey: ["tms-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tms_projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
    },
  });

  if (project.isLoading) return <Skeleton className="h-40" />;
  if (!project.data) return <Card className="p-6">Project not found.</Card>;

  return (
    <div className="space-y-4">
      <Link to="/tasks/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All projects
      </Link>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-lg shrink-0" style={{ background: (project.data.color ?? "#6366f1") + "33" }} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">{project.data.name}</h1>
              <Badge variant="outline" className="capitalize">{project.data.status}</Badge>
              <Badge variant="outline" className="capitalize">{project.data.visibility}</Badge>
            </div>
            {project.data.description && <p className="text-sm text-muted-foreground mt-1">{project.data.description}</p>}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="sprints"><Repeat className="size-4 mr-1.5" /> Sprints</TabsTrigger>
          <TabsTrigger value="milestones"><Flag className="size-4 mr-1.5" /> Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks"><TasksTab projectId={projectId} companyId={companyId} /></TabsContent>
        <TabsContent value="sprints"><SprintsTab projectId={projectId} companyId={companyId} /></TabsContent>
        <TabsContent value="milestones"><MilestonesTab projectId={projectId} companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function TasksTab({ projectId, companyId }: { projectId: string; companyId: string | null }) {
  const tasks = useQuery({
    queryKey: ["tms-tasks", "project", projectId],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, projectId, includeDone: true }),
  });
  if (tasks.isLoading) return <Skeleton className="h-32" />;
  if (!tasks.data?.length) return <Card className="p-6 text-sm text-muted-foreground text-center">No tasks yet in this project.</Card>;
  return (
    <Card className="divide-y">
      {tasks.data.map((t) => (
        <Link key={t.id} to="/tasks/$taskId" params={{ taskId: t.id }} className="flex items-center gap-3 p-3 hover:bg-muted/40">
          <span className="size-2 rounded-full shrink-0" style={{ background: t.tms_task_statuses?.color ?? "#94a3b8" }} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{t.title}</div>
            <div className="text-xs text-muted-foreground">
              {t.tms_task_statuses?.name ?? "—"}
              {t.due_date && ` · Due ${format(new Date(t.due_date), "MMM d")}`}
            </div>
          </div>
          <PriorityBadge priority={t.priority} />
          <AssigneeAvatars size="xs" people={t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)} />
        </Link>
      ))}
    </Card>
  );
}

function SprintsTab({ projectId, companyId }: { projectId: string; companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const list = useQuery({
    queryKey: ["tms-sprints", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("tms_sprints").select("*").eq("project_id", projectId).order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !name || !start || !end) return;
      const { error } = await supabase.from("tms_sprints").insert({ company_id: companyId, project_id: projectId, name, goal: goal || null, start_date: start, end_date: end });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setName(""); setGoal(""); setStart(""); setEnd(""); qc.invalidateQueries({ queryKey: ["tms-sprints", projectId] }); toast.success("Sprint created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const close = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tms_sprints").update({ closed_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-sprints", projectId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" /> New sprint</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New sprint</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Sprint name" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea placeholder="Goal (optional)" value={goal} onChange={(e) => setGoal(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {list.data?.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No sprints yet.</Card>
      ) : (
        <Card className="divide-y">
          {list.data?.map((s) => (
            <div key={s.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  <Link to="/tasks/projects/$projectId/sprints/$sprintId" params={{ projectId, sprintId: s.id }} className="hover:underline">
                    {s.name}
                  </Link>
                  {s.closed_at && <Badge variant="outline" className="ml-1">Closed</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(s.start_date), "MMM d")} → {format(new Date(s.end_date), "MMM d, yyyy")}
                  {s.goal && ` · ${s.goal}`}
                </div>
              </div>
              {!s.closed_at && <Button variant="ghost" size="sm" onClick={() => close.mutate(s.id)}>Close</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function MilestonesTab({ projectId, companyId }: { projectId: string; companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [target, setTarget] = useState("");

  const list = useQuery({
    queryKey: ["tms-milestones", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("tms_milestones").select("*").eq("project_id", projectId).order("target_date", { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !name) return;
      const { error } = await supabase.from("tms_milestones").insert({ company_id: companyId, project_id: projectId, name, description: desc || null, target_date: target || null });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); setName(""); setDesc(""); setTarget(""); qc.invalidateQueries({ queryKey: ["tms-milestones", projectId] }); toast.success("Milestone created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const complete = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("tms_milestones").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-milestones", projectId] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tms_milestones").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-milestones", projectId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" /> New milestone</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New milestone</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {list.data?.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground text-center">No milestones yet.</Card>
      ) : (
        <Card className="divide-y">
          {list.data?.map((m) => (
            <div key={m.id} className="p-3 flex items-center gap-3">
              <Flag className={`size-5 ${m.completed_at ? "text-emerald-500" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.name} {m.completed_at && <Badge className="ml-1">Done</Badge>}</div>
                <div className="text-xs text-muted-foreground">
                  {m.target_date ? `Target ${format(new Date(m.target_date), "MMM d, yyyy")}` : "No target date"}
                  {m.description && ` · ${m.description}`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => complete.mutate({ id: m.id, done: !m.completed_at })}>
                {m.completed_at ? "Reopen" : "Complete"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.id)}><X className="size-4" /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
