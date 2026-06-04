import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { toast } from "sonner";
import { categoryMeta } from "@/lib/tms/categories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks/weekly")({
  component: WeeklyPage,
});

type WkTask = {
  id: string;
  title: string;
  category: string | null;
  priority: "low" | "medium" | "high" | "critical";
  scheduled_date: string | null;
  scheduled_time: string | null;
  tms_task_statuses: { name: string; is_terminal: boolean } | null;
};

function WeeklyPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(new Date());

  // Working week: Sat-Wed for BD (start Sat). We'll show 5 days from week start.
  const weekStart = startOfWeek(anchor, { weekStartsOn: 6 }); // Saturday
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const from = days[0].toISOString().slice(0, 10);
  const to = days[4].toISOString().slice(0, 10);

  const tasks = useQuery({
    queryKey: ["weekly-tasks", companyId, user?.id, from, to],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tms_tasks")
        .select(`id,title,category,priority,scheduled_date,scheduled_time,
          tms_task_statuses(name,is_terminal),
          tms_task_assignees!inner(user_id)`)
        .eq("company_id", companyId!)
        .eq("tms_task_assignees.user_id", user!.id)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .is("deleted_at", null)
        .order("scheduled_time", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as unknown as WkTask[];
    },
  });

  const reschedule = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("tms_tasks").update({ scheduled_date: date }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rescheduled");
      qc.invalidateQueries({ queryKey: ["weekly-tasks"] });
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byDay = (day: Date) => (tasks.data ?? []).filter((t) => t.scheduled_date && isSameDay(new Date(t.scheduled_date), day));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Week of {format(weekStart, "MMM d, yyyy")}</h2>
          <p className="text-xs text-muted-foreground">Drag a task between days to reschedule</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>This week</Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {days.map((d) => (
            <DayColumn
              key={d.toISOString()}
              day={d}
              items={byDay(d)}
              onDrop={(taskId) => reschedule.mutate({ id: taskId, date: d.toISOString().slice(0, 10) })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DayColumn({ day, items, onDrop }: { day: Date; items: WkTask[]; onDrop: (taskId: string) => void }) {
  const [over, setOver] = useState(false);
  const isCurrentDay = isSameDay(day, new Date());
  return (
    <Card
      className={cn("p-3 min-h-[18rem] flex flex-col gap-2", over && "ring-2 ring-primary", isCurrentDay && "bg-primary/5")}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(day, "EEE")}</div>
          <div className={cn("text-lg font-semibold", isCurrentDay && "text-primary")}>{format(day, "d MMM")}</div>
        </div>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="flex-1 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground/70 text-center mt-6">No tasks</div>
        ) : items.map((t) => <DraggableTask key={t.id} task={t} />)}
      </div>
    </Card>
  );
}

function DraggableTask({ task }: { task: WkTask }) {
  const cat = categoryMeta(task.category);
  const isDone = !!task.tms_task_statuses?.is_terminal;
  const priorityBorder: Record<string, string> = {
    critical: "border-l-red-500",
    high: "border-l-red-400",
    medium: "border-l-amber-400",
    low: "border-l-emerald-400",
  };
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className={cn(
        "p-2 rounded-md border bg-card border-l-4 cursor-grab active:cursor-grabbing text-xs space-y-1 hover:shadow",
        priorityBorder[task.priority],
        isDone && "opacity-60 line-through",
      )}
    >
      {cat && <Badge variant="secondary" className={cn("text-[10px] py-0", cat.color)}>{cat.label}</Badge>}
      <div className="font-medium leading-snug">{task.title}</div>
      {task.scheduled_time && <div className="text-muted-foreground">{task.scheduled_time.slice(0, 5)}</div>}
    </div>
  );
}
