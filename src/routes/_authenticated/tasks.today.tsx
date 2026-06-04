import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { TASK_CATEGORIES, type TaskCategoryValue } from "@/lib/tms/categories";
import { DailyTaskCard, fetchDailyTasks, todayStr } from "@/components/tms/DailyTaskCard";

export const Route = createFileRoute("/_authenticated/tasks/today")({
  component: TodayPage,
});

function TodayPage() {
  const { companyId, user, isStaff } = useAuth();
  const qc = useQueryClient();
  const today = todayStr();

  const tasks = useQuery({
    queryKey: ["daily-tasks", companyId, user?.id, today],
    enabled: !!companyId && !!user?.id,
    queryFn: () => fetchDailyTasks(companyId!, user!.id, today),
  });

  const leads = useQuery({
    queryKey: ["daily-tasks-leads", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("crm_leads")
        .select("id,customer_name")
        .eq("company_id", companyId!)
        .order("last_activity_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategoryValue>("visit");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [time, setTime] = useState<string>("");
  const [leadId, setLeadId] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId || !user?.id) throw new Error("Pick a company first");
      if (title.trim().length < 2) throw new Error("Title too short");
      const { data: status } = await supabase
        .from("tms_task_statuses")
        .select("id")
        .eq("company_id", companyId)
        .is("project_id", null)
        .eq("name", "To Do")
        .maybeSingle();
      const { data: inserted, error } = await supabase
        .from("tms_tasks")
        .insert({
          company_id: companyId,
          title: title.trim(),
          category,
          priority,
          scheduled_date: today,
          scheduled_time: time || null,
          lead_id: leadId || null,
          status_id: status?.id ?? null,
          created_by: user.id,
          task_type: "task",
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("tms_task_assignees").insert({
        task_id: inserted.id, user_id: user.id, role: "primary", assigned_by: user.id,
      });
    },
    onSuccess: () => {
      setTitle(""); setTime(""); setLeadId("");
      toast.success("Task added");
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const t = tasks.data ?? [];
    return {
      pending: t.filter((x) => x.tms_task_statuses?.name === "To Do" || !x.tms_task_statuses),
      progress: t.filter((x) => x.tms_task_statuses?.name === "In Progress"),
      review: t.filter((x) => x.tms_task_statuses?.name === "In Review"),
      done: t.filter((x) => x.tms_task_statuses?.is_terminal),
    };
  }, [tasks.data]);

  const total = tasks.data?.length ?? 0;
  const completed = grouped.done.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const cheer = pct >= 100 ? "All done — wrap up your EOD! 🎉" : pct >= 80 ? "Almost there!" : pct >= 50 ? "Great start!" : pct > 0 ? "Keep going." : "Plan your day and start strong.";

  const firstName = (user?.user_metadata?.full_name || user?.email || "there").split(/\s|@/)[0];

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Good {greet()}, {firstName}</h2>
            <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{completed} of {total} tasks completed</div>
            <Progress value={pct} className="w-44 mt-1" />
            <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><Sparkles className="size-3" /> {cheer}</p>
          </div>
        </div>
      </Card>

      {/* Add form */}
      <Card className="p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="grid gap-2 md:grid-cols-12"
        >
          <Input className="md:col-span-4" placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select value={category} onValueChange={(v) => setCategory(v as TaskCategoryValue)}>
            <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>{TASK_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
            <SelectTrigger className="md:col-span-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Input className="md:col-span-2" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <Select value={leadId || "none"} onValueChange={(v) => setLeadId(v === "none" ? "" : v)}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Link lead" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No lead</SelectItem>
              {(leads.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.customer_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="submit" className="md:col-span-1" disabled={create.isPending}>
            <Plus className="size-4" />
          </Button>
        </form>
      </Card>

      {/* Lists */}
      {tasks.isLoading ? (
        <div className="grid gap-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : total === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No tasks for today yet. Add one above.</Card>
      ) : (
        <div className="grid gap-4">
          <Section title="In Progress" items={grouped.progress} />
          <Section title="To Do" items={grouped.pending} />
          <Section title="In Review" items={grouped.review} />
          <Section title="Completed" items={grouped.done} />
        </div>
      )}

      {isStaff && <ManagerTeamFeed companyId={companyId!} date={today} />}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Awaited<ReturnType<typeof fetchDailyTasks>> }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">{title} <span className="opacity-60">({items.length})</span></h3>
      <div className="grid gap-2">
        {items.map((t) => <DailyTaskCard key={t.id} task={t} />)}
      </div>
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function ManagerTeamFeed({ companyId, date }: { companyId: string; date: string }) {
  const feed = useQuery({
    queryKey: ["team-activity", companyId, date],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("tms_tasks")
        .select(`created_by, status_id, tms_task_statuses(is_terminal), profiles:created_by(id, full_name, avatar_url)`)
        .eq("company_id", companyId)
        .eq("scheduled_date", date)
        .is("deleted_at", null);
      const byUser = new Map<string, { name: string; planned: number; done: number }>();
      for (const r of (rows ?? []) as any[]) {
        const uid = r.created_by;
        if (!uid) continue;
        const name = r.profiles?.full_name ?? "Unknown";
        const cur = byUser.get(uid) ?? { name, planned: 0, done: 0 };
        cur.planned += 1;
        if (r.tms_task_statuses?.is_terminal) cur.done += 1;
        byUser.set(uid, cur);
      }
      return Array.from(byUser.entries()).map(([id, v]) => ({ id, ...v }));
    },
  });
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Users className="size-4" /> Team activity today</h3>
      {feed.isLoading ? <Skeleton className="h-16" /> : (feed.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members have planned tasks for today.</p>
      ) : (
        <div className="grid gap-2">
          {feed.data!.map((r) => {
            const pct = r.planned ? Math.round((r.done / r.planned) * 100) : 0;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <div className="w-40 truncate text-sm">{r.name}</div>
                <Progress value={pct} className="flex-1" />
                <div className="text-xs text-muted-foreground w-20 text-right">{r.done}/{r.planned} ({pct}%)</div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
