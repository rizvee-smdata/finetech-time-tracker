import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, Pencil, Clock, Paperclip, ListChecks, GitBranch, Activity as ActivityIcon,
  MessageSquare, Upload, Trash2, Download, X,
} from "lucide-react";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import type { TaskWithRels } from "@/lib/tms/types";
import { fetchTasks } from "@/lib/tms/queries";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = useParams({ from: "/_authenticated/tasks/$taskId" });
  const { user, companyId } = useAuth();
  const [editing, setEditing] = useState(false);

  const task = useQuery({
    queryKey: ["tms-task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tms_tasks")
        .select(`
          *,
          tms_task_statuses(id, name, color, is_terminal),
          tms_projects(id, name, color),
          tms_task_assignees(user_id, role, profiles:user_id(id, full_name, avatar_url))
        `)
        .eq("id", taskId)
        .single();
      if (error) throw error;
      return data as unknown as TaskWithRels;
    },
  });

  if (task.isLoading) return <Skeleton className="h-60" />;
  if (!task.data) return <Card className="p-6">Task not found.</Card>;
  const t = task.data;

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/tasks/list" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Back to tasks
      </Link>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="capitalize">{t.task_type}</Badge>
              <PriorityBadge priority={t.priority} />
              {t.tms_task_statuses && (
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="size-2 rounded-full" style={{ background: t.tms_task_statuses.color }} />
                  {t.tms_task_statuses.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold mt-2">{t.title}</h1>
            {t.tms_projects && (
              <Link to="/tasks/projects/$projectId" params={{ projectId: t.tms_projects.id }} className="text-sm text-primary hover:underline">
                in {t.tms_projects.name}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={t.tms_task_statuses?.is_terminal ? "outline" : "default"}
              disabled={toggleDone.isPending}
              onClick={() => toggleDone.mutate(!t.tms_task_statuses?.is_terminal)}
            >
              <Check className="size-4 mr-2" />
              {t.tms_task_statuses?.is_terminal ? "Reopen" : "Mark complete"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4 mr-2" /> Edit</Button>
          </div>
        </div>

        {t.description && (
          <div className="text-sm whitespace-pre-wrap text-muted-foreground">{t.description}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-3 border-t">
          <div>
            <div className="text-xs text-muted-foreground">Due date</div>
            <div className="font-medium">{t.due_date ? format(new Date(t.due_date), "MMM d, yyyy") : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Hours</div>
            <div className="font-medium">{t.logged_hours}{t.estimated_hours ? ` / ${t.estimated_hours}` : ""}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Assignees</div>
            <AssigneeAvatars size="sm" people={t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Created</div>
            <div className="font-medium">{format(new Date(t.created_at), "MMM d, yyyy")}</div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="comments">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="comments"><MessageSquare className="size-4 mr-1.5" /> Comments</TabsTrigger>
          <TabsTrigger value="checklist"><ListChecks className="size-4 mr-1.5" /> Checklist</TabsTrigger>
          <TabsTrigger value="attachments"><Paperclip className="size-4 mr-1.5" /> Attachments</TabsTrigger>
          <TabsTrigger value="dependencies"><GitBranch className="size-4 mr-1.5" /> Dependencies</TabsTrigger>
          <TabsTrigger value="time"><Clock className="size-4 mr-1.5" /> Time</TabsTrigger>
          <TabsTrigger value="activity"><ActivityIcon className="size-4 mr-1.5" /> Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="comments"><CommentsPanel taskId={taskId} userId={user?.id} /></TabsContent>
        <TabsContent value="checklist"><ChecklistPanel taskId={taskId} /></TabsContent>
        <TabsContent value="attachments"><AttachmentsPanel taskId={taskId} userId={user?.id} /></TabsContent>
        <TabsContent value="dependencies"><DependenciesPanel taskId={taskId} companyId={companyId} /></TabsContent>
        <TabsContent value="time"><TimePanel taskId={taskId} userId={user?.id} /></TabsContent>
        <TabsContent value="activity"><ActivityPanel taskId={taskId} /></TabsContent>
      </Tabs>

      <TaskFormDialog open={editing} onOpenChange={setEditing} editing={t} />
    </div>
  );
}

function CommentsPanel({ taskId, userId }: { taskId: string; userId?: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const comments = useQuery({
    queryKey: ["tms-comments", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tms_task_comments")
        .select("*, profiles:author_id(full_name, avatar_url)")
        .eq("task_id", taskId)
        .is("deleted_at", null)
        .order("created_at");
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!body.trim() || !userId) return;
      const { error } = await supabase.from("tms_task_comments").insert({ task_id: taskId, author_id: userId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["tms-comments", taskId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-4 space-y-3">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {comments.data?.length === 0 && <div className="text-sm text-muted-foreground">No comments yet.</div>}
        {comments.data?.map((c: { id: string; author_id: string; body: string; created_at: string; profiles: { full_name: string | null } | null }) => (
          <div key={c.id} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.profiles?.full_name ?? "User"}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, HH:mm")}</span>
            </div>
            <div className="whitespace-pre-wrap mt-0.5">{c.body}</div>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="space-y-2 pt-2 border-t">
        <Textarea rows={2} placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" size="sm" disabled={!body.trim() || add.isPending}>Post</Button>
      </form>
    </Card>
  );
}

function ChecklistPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const items = useQuery({
    queryKey: ["tms-checklist", taskId],
    queryFn: async () => {
      const { data } = await supabase.from("tms_checklist_items").select("*").eq("task_id", taskId).order("sort_order").order("created_at");
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!title.trim()) return;
      const { error } = await supabase.from("tms_checklist_items").insert({ task_id: taskId, title: title.trim(), sort_order: (items.data?.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { setTitle(""); qc.invalidateQueries({ queryKey: ["tms-checklist", taskId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("tms_checklist_items").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-checklist", taskId] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tms_checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-checklist", taskId] }),
  });
  const done = (items.data ?? []).filter((i) => i.done_at).length;
  return (
    <Card className="p-4 space-y-3">
      {items.data && items.data.length > 0 && (
        <div className="text-xs text-muted-foreground">{done} of {items.data.length} complete</div>
      )}
      <div className="space-y-1.5">
        {items.data?.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm group">
            <Checkbox checked={!!i.done_at} onCheckedChange={(v) => toggle.mutate({ id: i.id, done: !!v })} />
            <span className={i.done_at ? "line-through text-muted-foreground flex-1" : "flex-1"}>{i.title}</span>
            <button onClick={() => remove.mutate(i.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
              <X className="size-4" />
            </button>
          </div>
        ))}
        {items.data?.length === 0 && <div className="text-sm text-muted-foreground">No checklist items.</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="flex gap-2 pt-2 border-t">
        <Input placeholder="Add item…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>Add</Button>
      </form>
    </Card>
  );
}

function AttachmentsPanel({ taskId, userId }: { taskId: string; userId?: string }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const list = useQuery({
    queryKey: ["tms-attachments", taskId],
    queryFn: async () => {
      const { data } = await supabase.from("tms_task_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const path = `${taskId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("tms-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("tms_task_attachments").insert({
        task_id: taskId, file_name: file.name, file_path: path, file_size: file.size, content_type: file.type, uploaded_by: userId,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["tms-attachments", taskId] });
      toast.success("File uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function downloadFile(path: string, name: string) {
    const { data, error } = await supabase.storage.from("tms-attachments").createSignedUrl(path, 60);
    if (error || !data) { toast.error("Download failed"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = name; a.click();
  }

  const remove = useMutation({
    mutationFn: async (att: { id: string; file_path: string }) => {
      await supabase.storage.from("tms-attachments").remove([att.file_path]);
      const { error } = await supabase.from("tms_task_attachments").delete().eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-attachments", taskId] }),
  });

  return (
    <Card className="p-4 space-y-3">
      <label className="inline-flex">
        <input type="file" hidden onChange={handleUpload} disabled={uploading} />
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer hover:bg-muted">
          <Upload className="size-4" /> {uploading ? "Uploading…" : "Upload file"}
        </span>
      </label>
      <div className="space-y-1.5">
        {list.data?.length === 0 && <div className="text-sm text-muted-foreground">No attachments.</div>}
        {list.data?.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip className="size-4 text-muted-foreground shrink-0" />
              <span className="truncate">{a.file_name}</span>
              {a.file_size && <span className="text-xs text-muted-foreground">({Math.round(a.file_size / 1024)} KB)</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => downloadFile(a.file_path, a.file_name)}><Download className="size-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate({ id: a.id, file_path: a.file_path })}><Trash2 className="size-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DependenciesPanel({ taskId, companyId }: { taskId: string; companyId: string | null }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"is_blocked_by" | "blocks" | "relates_to">("is_blocked_by");

  const deps = useQuery({
    queryKey: ["tms-deps", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tms_task_dependencies")
        .select("id, dependency_type, depends_on_task_id, tms_tasks!tms_task_dependencies_depends_on_task_id_fkey(id, title, tms_task_statuses(name, color))")
        .eq("task_id", taskId);
      return data ?? [];
    },
  });

  const candidates = useQuery({
    queryKey: ["tms-tasks-search", companyId, search],
    enabled: !!companyId && search.length >= 2,
    queryFn: () => fetchTasks({ companyId: companyId!, search, includeDone: true }),
  });

  const add = useMutation({
    mutationFn: async (depTaskId: string) => {
      const { error } = await supabase.from("tms_task_dependencies").insert({
        task_id: taskId, depends_on_task_id: depTaskId, dependency_type: type,
      });
      if (error) throw error;
    },
    onSuccess: () => { setSearch(""); qc.invalidateQueries({ queryKey: ["tms-deps", taskId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tms_task_dependencies").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tms-deps", taskId] }),
  });

  type DepRow = {
    id: string;
    dependency_type: string;
    depends_on_task_id: string;
    tms_tasks: { id: string; title: string; tms_task_statuses: { name: string; color: string } | null } | null;
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="space-y-1.5">
        {deps.data?.length === 0 && <div className="text-sm text-muted-foreground">No dependencies.</div>}
        {(deps.data as DepRow[] | undefined)?.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
            <Badge variant="outline" className="capitalize">{d.dependency_type.replace(/_/g, " ")}</Badge>
            <Link to="/tasks/$taskId" params={{ taskId: d.depends_on_task_id }} className="flex-1 hover:underline truncate">
              {d.tms_tasks?.title ?? "Task"}
            </Link>
            {d.tms_tasks?.tms_task_statuses && (
              <span className="text-xs text-muted-foreground">{d.tms_tasks.tms_task_statuses.name}</span>
            )}
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(d.id)}><X className="size-4" /></Button>
          </div>
        ))}
      </div>
      <div className="pt-2 border-t space-y-2">
        <div className="flex gap-2">
          <Select value={type} onValueChange={(v) => setType(v as "is_blocked_by" | "blocks" | "relates_to")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="is_blocked_by">Is blocked by</SelectItem>
              <SelectItem value="blocks">Blocks</SelectItem>
              <SelectItem value="relates_to">Relates to</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {candidates.data && candidates.data.length > 0 && (
          <div className="border rounded-md max-h-48 overflow-y-auto">
            {candidates.data.filter((c) => c.id !== taskId).slice(0, 10).map((c) => (
              <button key={c.id} type="button" onClick={() => add.mutate(c.id)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted truncate">
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function TimePanel({ taskId, userId }: { taskId: string; userId?: string }) {
  const qc = useQueryClient();
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const logs = useQuery({
    queryKey: ["tms-time-logs", taskId],
    queryFn: async () => {
      const { data } = await supabase.from("tms_time_logs").select("*, profiles:user_id(full_name)").eq("task_id", taskId).order("log_date", { ascending: false });
      return data ?? [];
    },
  });
  const log = useMutation({
    mutationFn: async () => {
      const h = Number(hours);
      if (!h || !userId) return;
      const { error } = await supabase.from("tms_time_logs").insert({ task_id: taskId, user_id: userId, hours: h, note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { setHours(""); setNote(""); qc.invalidateQueries({ queryKey: ["tms-time-logs", taskId] }); qc.invalidateQueries({ queryKey: ["tms-task", taskId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  type LogRow = { id: string; hours: number; note: string | null; log_date: string; profiles: { full_name: string | null } | null };
  return (
    <Card className="p-4 space-y-3">
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {logs.data?.length === 0 && <div className="text-sm text-muted-foreground">No time logged yet.</div>}
        {(logs.data as LogRow[] | undefined)?.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{l.hours}h</span>
              <span className="text-muted-foreground"> · {l.profiles?.full_name ?? "User"}</span>
              {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
            </div>
            <span className="text-xs text-muted-foreground">{format(new Date(l.log_date), "MMM d")}</span>
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); log.mutate(); }} className="space-y-2 pt-2 border-t">
        <div className="flex gap-2">
          <Input type="number" step="0.25" min="0" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} className="w-24" />
          <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button type="submit" size="sm" disabled={!hours || log.isPending}>Log time</Button>
      </form>
    </Card>
  );
}

function ActivityPanel({ taskId }: { taskId: string }) {
  const activity = useQuery({
    queryKey: ["tms-activity", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tms_task_activity")
        .select("*, profiles:actor_id(full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });
  type ActRow = { id: string; event_type: string; created_at: string; profiles: { full_name: string | null } | null };
  return (
    <Card className="p-4">
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {activity.data?.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
        {(activity.data as ActRow[] | undefined)?.map((a) => (
          <div key={a.id} className="text-sm flex gap-2">
            <span className="text-xs text-muted-foreground w-32 shrink-0">{format(new Date(a.created_at), "MMM d, HH:mm")}</span>
            <span>
              <span className="font-medium">{a.profiles?.full_name ?? "Someone"}</span>{" "}
              <span className="text-muted-foreground">{a.event_type.replace(/_/g, " ")}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
