import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects, fetchStatuses, fetchTasks } from "@/lib/tms/queries";
import type { TaskWithRels, TmsStatus } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { isOverdue } from "@/lib/tms/utils";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks/board")({
  component: BoardPage,
});

function BoardPage() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TaskWithRels | null>(null);
  const [defaultStatusId, setDefaultStatusId] = useState<string | null>(null);

  const projects = useQuery({
    queryKey: ["tms-projects", companyId],
    enabled: !!companyId,
    queryFn: () => fetchProjects(companyId!),
  });
  const statuses = useQuery({
    queryKey: ["tms-statuses", companyId, projectId],
    enabled: !!companyId,
    queryFn: () => fetchStatuses(companyId!, projectId),
  });
  const tasks = useQuery({
    queryKey: ["tms-tasks", "board", companyId, projectId, search],
    enabled: !!companyId,
    queryFn: () => fetchTasks({ companyId: companyId!, projectId, search: search || null, includeDone: true }),
  });

  const move = useMutation({
    mutationFn: async ({ id, status_id }: { id: string; status_id: string }) => {
      const { error } = await supabase.from("tms_tasks").update({ status_id }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status_id }) => {
      await qc.cancelQueries({ queryKey: ["tms-tasks"] });
      const prev = qc.getQueryData<TaskWithRels[]>(["tms-tasks", "board", companyId, projectId, search]);
      qc.setQueryData<TaskWithRels[]>(["tms-tasks", "board", companyId, projectId, search], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, status_id } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tms-tasks", "board", companyId, projectId, search], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tms-tasks"] }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TaskWithRels[]>();
    for (const s of statuses.data ?? []) map.set(s.id, []);
    for (const t of tasks.data ?? []) {
      if (!t.status_id) continue;
      if (!map.has(t.status_id)) map.set(t.status_id, []);
      map.get(t.status_id)!.push(t);
    }
    return map;
  }, [tasks.data, statuses.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatusId = String(over.id);
    const t = (tasks.data ?? []).find((x) => x.id === taskId);
    if (!t || t.status_id === newStatusId) return;
    move.mutate({ id: taskId, status_id: newStatusId });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={projectId ?? "all"} onValueChange={(v) => setProjectId(v === "all" ? null : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {tasks.isLoading || statuses.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {(statuses.data ?? []).map((s) => (
              <Column
                key={s.id}
                status={s}
                tasks={grouped.get(s.id) ?? []}
                onEdit={setEditing}
                onAdd={() => { setDefaultStatusId(s.id); setEditing({} as TaskWithRels); }}
              />
            ))}
          </div>
        </DndContext>
      )}

      <TaskFormDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) { setEditing(null); setDefaultStatusId(null); } }}
        editing={editing && editing.id ? editing : null}
        defaultProjectId={projectId}
        defaultStatusId={defaultStatusId}
      />
    </div>
  );
}

function Column({
  status,
  tasks,
  onEdit,
  onAdd,
}: {
  status: TmsStatus;
  tasks: TaskWithRels[];
  onEdit: (t: TaskWithRels) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  const wipExceeded = status.wip_limit != null && tasks.length > status.wip_limit;

  return (
    <div className="w-72 shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: status.color }} />
          <span className="text-sm font-semibold">{status.name}</span>
          <span className={cn("text-xs", wipExceeded ? "text-red-500 font-semibold" : "text-muted-foreground")}>
            {tasks.length}{status.wip_limit != null ? `/${status.wip_limit}` : ""}
          </span>
          {wipExceeded && <AlertCircle className="size-3.5 text-red-500" />}
        </div>
        <button onClick={onAdd} className="text-muted-foreground hover:text-foreground text-lg leading-none px-1">+</button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[200px] rounded-lg p-2 space-y-2 transition-colors",
          isOver ? "bg-primary/5 ring-2 ring-primary/30" : "bg-muted/30",
        )}
      >
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onEdit={onEdit} />
        ))}
        {tasks.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6">Drop tasks here</div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit }: { task: TaskWithRels; onEdit: (t: TaskWithRels) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const overdue = isOverdue(task);
  return (
    <Card
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined}
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing space-y-2 hover:shadow-md transition-shadow",
        isDragging && "opacity-50",
      )}
      onDoubleClick={() => onEdit(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-tight flex-1">{task.title}</div>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.tms_projects && (
        <div className="text-[11px] text-muted-foreground">{task.tms_projects.name}</div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]">
          {task.due_date && (
            <span className={cn("text-muted-foreground", overdue && "text-red-600 font-medium")}>
              {format(new Date(task.due_date), "MMM d")}
            </span>
          )}
          {task.logged_hours > 0 && (
            <span className="text-muted-foreground">{task.logged_hours}h</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AssigneeAvatars
            size="xs"
            people={task.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)}
          />
          <Link
            to="/tasks/$taskId"
            params={{ taskId: task.id }}
            className="text-[11px] text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Open
          </Link>
        </div>
      </div>
    </Card>
  );
}
