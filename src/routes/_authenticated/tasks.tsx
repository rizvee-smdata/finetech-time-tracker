import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Plus, LayoutGrid, List, Calendar, Folder, Inbox, GanttChart, BarChart3 } from "lucide-react";
import { TaskFormDialog } from "@/components/tms/TaskFormDialog";
import { TaskCommandPalette } from "@/components/tms/TaskCommandPalette";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksLayout,
});

const TABS = [
  { to: "/tasks", label: "My Tasks", icon: Inbox, exact: true },
  { to: "/tasks/board", label: "Board", icon: LayoutGrid },
  { to: "/tasks/list", label: "List", icon: List },
  { to: "/tasks/calendar", label: "Calendar", icon: Calendar },
  { to: "/tasks/gantt", label: "Gantt", icon: GanttChart },
  { to: "/tasks/projects", label: "Projects", icon: Folder },
  { to: "/tasks/reports", label: "Reports", icon: BarChart3 },
] as const;

function TasksLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  function isActive(to: string, exact?: boolean) {
    if (exact) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(to + "/");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Plan, assign, and track work. Press <kbd className="px-1.5 py-0.5 text-xs rounded border bg-muted">⌘K</kbd> to search.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4 mr-2" /> New task
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const active = isActive(t.to, t.exact);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />

      <TaskFormDialog open={open} onOpenChange={setOpen} />
      <TaskCommandPalette />
    </div>
  );
}
