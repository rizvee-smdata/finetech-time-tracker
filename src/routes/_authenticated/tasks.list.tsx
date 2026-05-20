import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects, fetchStatuses, fetchTasks } from "@/lib/tms/queries";
import type { TaskWithRels } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, ListTodo, Bookmark, BookmarkPlus, X } from "lucide-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge } from "@/components/tms/PriorityBadge";
import { AssigneeAvatars } from "@/components/tms/AssigneeAvatars";
import { EmptyState } from "@/components/tms/EmptyState";
import { isOverdue } from "@/lib/tms/utils";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";
import { TaskQuickAdd } from "@/components/tms/TaskQuickAdd";
import { Button } from "@/components/ui/button";
import { useSavedViews } from "@/lib/tms/saved-views";
import { PRIORITIES } from "@/lib/tms/types";
import { PaginationBar, usePagination } from "@/components/PageSizeSelect";

export const Route = createFileRoute("/_authenticated/tasks/list")({
  component: ListPage,
});

function ListPage() {
  const { companyId, ready } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const [editing, setEditing] = useState<TaskWithRels | null>(null);
  const { views, save, remove } = useSavedViews("list");

  function applyView(name: string) {
    const v = views.find((x) => x.name === name);
    if (!v) return;
    setProjectId(v.filters.projectId);
    setStatusId(v.filters.statusId);
    setPriority(v.filters.priority);
    setSearch(v.filters.search);
    setIncludeDone(v.filters.includeDone);
  }

  function saveCurrent() {
    const name = window.prompt("Name this view");
    if (!name) return;
    save({ name, filters: { projectId, statusId, priority, search, includeDone } });
  }

  const projects = useQuery({
    queryKey: ["tms-projects", companyId],
    enabled: ready && !!companyId,
    queryFn: () => fetchProjects(companyId!),
  });
  const statuses = useQuery({
    queryKey: ["tms-statuses", companyId, projectId],
    enabled: ready && !!companyId,
    queryFn: () => fetchStatuses(companyId!, projectId),
  });
  const tasks = useQuery({
    queryKey: ["tms-tasks", "list", companyId, projectId, statusId, priority, search, includeDone],
    enabled: ready && !!companyId,
    queryFn: () => fetchTasks({
      companyId: companyId!,
      projectId,
      statusId,
      priority,
      search: search || null,
      includeDone,
    }),
  });

  const pg = usePagination(tasks.data ?? [], 20);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={projectId ?? "all"} onValueChange={(v) => setProjectId(v === "all" ? null : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(projects.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusId ?? "all"} onValueChange={(v) => setStatusId(v === "all" ? null : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(statuses.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority ?? "all"} onValueChange={(v) => setPriority(v === "all" ? null : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Show closed
        </label>
        <Button size="sm" variant="outline" onClick={saveCurrent} title="Save current filters">
          <BookmarkPlus className="size-4 mr-1" /> Save view
        </Button>
      </div>

      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Bookmark className="size-3.5" /> My views:</span>
          {views.map((v) => (
            <span key={v.name} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2 pr-1 py-0.5 text-xs">
              <button className="hover:underline" onClick={() => applyView(v.name)}>{v.name}</button>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => remove(v.name)} aria-label="Remove view">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <TaskQuickAdd projectId={projectId} invalidateKeys={[["tms-tasks", "list"]]} />

      <Card className="p-0 overflow-hidden">
        {tasks.isLoading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !tasks.data?.length ? (
          <EmptyState icon={ListTodo} title="No tasks match" description="Adjust filters or create a new task." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignees</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.paged.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setEditing(t)}>
                  <TableCell className="font-medium max-w-[280px] truncate">{t.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.tms_projects?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-full" style={{ background: t.tms_task_statuses?.color ?? "#94a3b8" }} />
                      {t.tms_task_statuses?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell>
                    <AssigneeAvatars size="xs" people={t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean)} />
                  </TableCell>
                  <TableCell className={cn("text-sm", isOverdue(t) && "text-red-600 font-medium")}>
                    {t.due_date ? format(new Date(t.due_date), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {t.logged_hours}{t.estimated_hours ? `/${t.estimated_hours}` : ""}
                    {" "}
                    <Link
                      to="/tasks/$taskId"
                      params={{ taskId: t.id }}
                      className="text-xs text-primary hover:underline ml-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <PaginationBar {...pg} label="tasks" />

      <TaskFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} editing={editing} />
    </div>
  );
}
