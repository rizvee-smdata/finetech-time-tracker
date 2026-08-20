import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { fetchProjects, fetchStatuses, fetchTasks, setTaskDone } from "@/lib/tms/queries";

import type { TaskWithRels } from "@/lib/tms/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, ListTodo, Bookmark, BookmarkPlus, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/tasks/list")({
  component: ListPage,
});

type SortKey = "title" | "project" | "customer" | "status" | "priority" | "due";
type SortDir = "asc" | "desc";

function ListPage() {
  const { companyId, ready } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeDone, setIncludeDone] = useState(false);
  const [editing, setEditing] = useState<TaskWithRels | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { views, save, remove } = useSavedViews("list");

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

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

  const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...(tasks.data ?? [])].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = (() => {
      switch (sortKey) {
        case "title": return (a.title || "").toLowerCase();
        case "project": return (a.tms_projects?.name || "").toLowerCase();
        case "customer": return (a.crm_leads?.customer_name || a.crm_leads?.company_name || "").toLowerCase();
        case "status": return (a.tms_task_statuses?.name || "").toLowerCase();
        case "priority": return priorityRank[a.priority] ?? 99;
        case "due": return a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      }
    })();
    const bv = (() => {
      switch (sortKey) {
        case "title": return (b.title || "").toLowerCase();
        case "project": return (b.tms_projects?.name || "").toLowerCase();
        case "customer": return (b.crm_leads?.customer_name || b.crm_leads?.company_name || "").toLowerCase();
        case "status": return (b.tms_task_statuses?.name || "").toLowerCase();
        case "priority": return priorityRank[b.priority] ?? 99;
        case "due": return b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      }
    })();
    if (av! < bv!) return -1 * dir;
    if (av! > bv!) return 1 * dir;
    return 0;
  });

  const pg = usePagination(sorted, 20);


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
                <SortableHead label="Title" k="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Project" k="project" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Customer" k="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="Priority" k="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <TableHead>Assignees</TableHead>
                <SortableHead label="Due" k="due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.paged.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setEditing(t)}>
                  <TableCell className="font-medium max-w-[280px] truncate">{t.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.tms_projects?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {t.crm_leads?.customer_name || t.crm_leads?.company_name || "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="size-2 rounded-full" style={{ background: t.tms_task_statuses?.color ?? "#94a3b8" }} />
                      {t.tms_task_statuses?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell>
                    {(() => {
                      const people = t.tms_task_assignees.map((a) => a.profiles!).filter(Boolean);
                      if (people.length === 0) return <span className="text-xs text-muted-foreground">Unassigned</span>;
                      const names = people.map((p) => p.full_name || "—");
                      return (
                        <div className="flex items-center gap-2 min-w-0">
                          <AssigneeAvatars size="xs" people={people} />
                          <span className="text-xs truncate max-w-[160px]" title={names.join(", ")}>
                            {names.join(", ")}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>

                  <TableCell className={cn("text-sm", isOverdue(t) && "text-red-600 font-medium")}>
                    {t.due_date ? (
                      <div className="flex flex-col leading-tight">
                        <span>{format(new Date(t.due_date), "MMM d, yyyy")}</span>
                        {(() => {
                          const d = differenceInCalendarDays(new Date(), new Date(t.due_date));
                          if (d > 0) return <span className="text-[11px] text-red-600">{d} day{d === 1 ? "" : "s"} overdue</span>;
                          if (d === 0) return <span className="text-[11px] text-amber-600">Due today</span>;
                          return <span className="text-[11px] text-muted-foreground">in {-d} day{-d === 1 ? "" : "s"}</span>;
                        })()}
                      </div>
                    ) : "—"}
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

function SortableHead({
  label, k, sortKey, sortDir, onSort, className,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 opacity-70" />
      </button>
    </TableHead>
  );
}

