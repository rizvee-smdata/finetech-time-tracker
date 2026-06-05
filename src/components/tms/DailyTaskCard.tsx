import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User2, Play, Check, CalendarClock, Link2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { categoryMeta } from "@/lib/tms/categories";
import { PRIORITY_COLORS, type Priority } from "@/lib/tms/types";
import { cn } from "@/lib/utils";

type DailyTask = {
  id: string;
  title: string;
  category: string | null;
  priority: Priority;
  scheduled_time: string | null;
  scheduled_date: string | null;
  lead_id: string | null;
  status_id: string | null;
  notes?: string | null;
  tms_task_statuses: { id: string; name: string; color: string; is_terminal: boolean } | null;
  crm_leads?: { id: string; customer_name: string } | null;
};

export function DailyTaskCard({ task, onChanged }: { task: DailyTask; onChanged?: () => void }) {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  const cat = categoryMeta(task.category);
  const isDone = !!task.tms_task_statuses?.is_terminal;
  const isVisit = task.category === "visit" || task.category === "Client Visit";

  const prepBrief = useQuery({
    queryKey: ["prep-brief-badge", task.id],
    enabled: isVisit,
    queryFn: async () => {
      const { data } = await supabase
        .from("meeting_prep_briefs")
        .select("id, status")
        .eq("task_id", task.id)
        .maybeSingle();
      return data;
    },
  });


  const statuses = useQuery({
    queryKey: ["tms-statuses-default", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tms_task_statuses")
        .select("id,name,is_terminal,sort_order")
        .eq("company_id", companyId!)
        .is("project_id", null)
        .order("sort_order");
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async (statusName: string) => {
      const target = statuses.data?.find((s) => s.name === statusName);
      if (!target) throw new Error("Status not found");
      const { error } = await supabase.from("tms_tasks").update({ status_id: target.id }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["tms-tasks"] });
      onChanged?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defer = useMutation({
    mutationFn: async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const { error } = await supabase.from("tms_tasks").update({ scheduled_date: tomorrow.toISOString().slice(0, 10) }).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deferred to tomorrow");
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priorityBorder: Record<Priority, string> = {
    critical: "border-l-red-500",
    high: "border-l-red-400",
    medium: "border-l-amber-400",
    low: "border-l-emerald-400",
  };

  return (
    <Card className={cn("p-3 border-l-4 transition-opacity", priorityBorder[task.priority], isDone && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {cat && <Badge variant="secondary" className={cat.color}>{cat.label}</Badge>}
            <Badge variant="outline" className={PRIORITY_COLORS[task.priority]}>{task.priority}</Badge>
            {task.scheduled_time && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="size-3" />{task.scheduled_time.slice(0, 5)}
              </span>
            )}
            {isVisit && prepBrief.data?.status === "ready" && (
              <Link to="/prep/$taskId" params={{ taskId: task.id }}>
                <Badge className="bg-primary/15 text-primary hover:bg-primary/20 cursor-pointer">
                  <Sparkles className="size-3 mr-1" /> Prep Ready
                </Badge>
              </Link>
            )}
            {isVisit && !prepBrief.data && (
              <Link to="/prep/$taskId" params={{ taskId: task.id }}>
                <Badge variant="outline" className="cursor-pointer">
                  <Sparkles className="size-3 mr-1" /> Generate Prep
                </Badge>
              </Link>
            )}
          </div>
          <div className={cn("font-medium text-sm", isDone && "line-through")}>{task.title}</div>
          {task.crm_leads && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1">
              <Link2 className="size-3" /> {task.crm_leads.customer_name}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {!isDone && (
            <>
              {task.tms_task_statuses?.name !== "In Progress" && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus.mutate("In Progress")} disabled={setStatus.isPending}>
                  <Play className="size-3 mr-1" /> Start
                </Button>
              )}
              <Button size="sm" className="h-7 text-xs" onClick={() => setStatus.mutate("Done")} disabled={setStatus.isPending}>
                <Check className="size-3 mr-1" /> Done
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => defer.mutate()} disabled={defer.isPending}>
                <CalendarClock className="size-3 mr-1" /> Defer
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export async function fetchDailyTasks(companyId: string, userId: string, date: string) {
  const { data, error } = await supabase
    .from("tms_tasks")
    .select(`id,title,category,priority,scheduled_time,scheduled_date,lead_id,status_id,notes,
      tms_task_statuses(id,name,color,is_terminal),
      crm_leads(id,customer_name),
      tms_task_assignees!inner(user_id)`)
    .eq("company_id", companyId)
    .eq("scheduled_date", date)
    .eq("tms_task_assignees.user_id", userId)
    .is("deleted_at", null)
    .order("scheduled_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as DailyTask[];
}

export type { DailyTask };
