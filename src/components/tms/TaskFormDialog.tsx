import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchCompanyMembers, fetchProjects, fetchStatuses } from "@/lib/tms/queries";
import { PRIORITIES, TASK_TYPES, type Priority, type TaskType, type TaskWithRels } from "@/lib/tms/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { personName } from "@/lib/tms/utils";
import { CustomFieldsSection } from "@/components/form-builder/CustomFieldsSection";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: TaskWithRels | null;
  defaultProjectId?: string | null;
  defaultStatusId?: string | null;
  defaultSprintId?: string | null;
  onSaved?: (taskId: string) => void;
};

export function TaskFormDialog({ open, onOpenChange, editing, defaultProjectId, defaultStatusId, defaultSprintId, onSaved }: Props) {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("task");
  const [dueDate, setDueDate] = useState("");
  const [estHours, setEstHours] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  const [sprintId, setSprintId] = useState<string | null>(defaultSprintId ?? null);
  const [statusId, setStatusId] = useState<string | null>(defaultStatusId ?? null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});


  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? "");
      setPriority(editing.priority);
      setTaskType(editing.task_type);
      setDueDate(editing.due_date ?? "");
      setEstHours(editing.estimated_hours?.toString() ?? "");
      setProjectId(editing.project_id);
      setSprintId(editing.sprint_id);
      setStatusId(editing.status_id);
      setAssigneeIds(editing.tms_task_assignees.map((a) => a.user_id));
      setLeadId((editing as any).lead_id ?? null);

      setIsPrivate(editing.is_private);
      setCustomFields((((editing as any).custom_fields) ?? {}) as Record<string, unknown>);
    } else {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setTaskType("task");
      setDueDate("");
      setEstHours("");
      setProjectId(defaultProjectId ?? null);
      setSprintId(defaultSprintId ?? null);
      setStatusId(defaultStatusId ?? null);
      setAssigneeIds([]);
      setIsPrivate(false);
      setCustomFields({});
    }
  }, [open, editing, defaultProjectId, defaultStatusId, defaultSprintId]);

  const projects = useQuery({
    queryKey: ["tms-projects", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchProjects(companyId!),
  });
  const statuses = useQuery({
    queryKey: ["tms-statuses", companyId, projectId],
    enabled: !!companyId && open,
    queryFn: () => fetchStatuses(companyId!, projectId),
  });
  const members = useQuery({
    queryKey: ["tms-members", companyId],
    enabled: !!companyId && open,
    queryFn: () => fetchCompanyMembers(companyId!),
  });
  const sprints = useQuery({
    queryKey: ["tms-sprints", projectId],
    enabled: !!projectId && open,
    queryFn: async () => {
      const { data } = await supabase.from("tms_sprints").select("*").eq("project_id", projectId!).order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!statusId && statuses.data && statuses.data.length > 0) {
      const first = statuses.data.find((s) => !s.is_terminal) ?? statuses.data[0];
      setStatusId(first.id);
    }
  }, [statuses.data, statusId]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title required");
      if (!companyId || !user) throw new Error("No session");

      const payload = {
        company_id: companyId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        task_type: taskType,
        due_date: dueDate || null,
        estimated_hours: estHours ? Number(estHours) : null,
        project_id: projectId,
        sprint_id: sprintId,
        status_id: statusId,
        is_private: isPrivate,
        created_by: editing?.created_by ?? user.id,
        custom_fields: customFields as any,
      };

      let taskId: string;
      if (editing) {
        const { error } = await supabase.from("tms_tasks").update(payload).eq("id", editing.id);
        if (error) throw error;
        taskId = editing.id;
        await supabase.from("tms_task_assignees").delete().eq("task_id", taskId);
      } else {
        const { data, error } = await supabase.from("tms_tasks").insert(payload).select("id").single();
        if (error) throw error;
        taskId = data.id;
      }

      if (assigneeIds.length) {
        const rows = assigneeIds.map((user_id) => ({
          task_id: taskId,
          user_id,
          role: "primary" as const,
          assigned_by: user.id,
        }));
        const { error } = await supabase.from("tms_task_assignees").insert(rows);
        if (error) throw error;
      }
      return taskId;
    },
    onSuccess: (taskId) => {
      toast.success(editing ? "Task updated" : "Task created");
      qc.invalidateQueries({ queryKey: ["tms-tasks"] });
      qc.invalidateQueries({ queryKey: ["tms-task", taskId] });
      onOpenChange(false);
      onSaved?.(taskId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>Capture work, assign people, set deadlines.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={statusId ?? ""} onValueChange={(v) => setStatusId(v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {(statuses.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Project</Label>
              <Select value={projectId ?? "none"} onValueChange={(v) => { setProjectId(v === "none" ? null : v); setSprintId(null); }}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Sprint</Label>
              <Select value={sprintId ?? "none"} onValueChange={(v) => setSprintId(v === "none" ? null : v)} disabled={!projectId}>
                <SelectTrigger><SelectValue placeholder={projectId ? "None" : "Select project first"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No sprint</SelectItem>
                  {(sprints.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Estimated hours</Label>
              <Input type="number" min="0" step="0.25" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
            </div>
            <div className="grid gap-1.5 items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(!!v)} />
                Private task (only assignees & admins)
              </label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Assignees</Label>
            <ScrollArea className="h-32 rounded-md border p-2">
              <div className="space-y-1">
                {(members.data ?? []).map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={assigneeIds.includes(m.id)} onCheckedChange={() => toggleAssignee(m.id)} />
                    <span className="text-sm">{personName(m)}</span>
                  </label>
                ))}
                {(members.data ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground px-1">No company members yet.</div>
                )}
              </div>
            </ScrollArea>
          </div>

          {companyId && (
            <CustomFieldsSection
              companyId={companyId}
              entity="task"
              values={customFields}
              onChange={setCustomFields}
              members={(members.data ?? []).map((m) => ({ id: m.id, label: personName(m) }))}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
