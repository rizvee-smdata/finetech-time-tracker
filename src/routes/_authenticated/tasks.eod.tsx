import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { Moon, CheckCircle2, MapPin, RefreshCcw, CalendarClock } from "lucide-react";
import { todayStr } from "@/components/tms/DailyTaskCard";

export const Route = createFileRoute("/_authenticated/tasks/eod")({
  component: EodPage,
});

function EodPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const today = todayStr();

  const summary = useQuery({
    queryKey: ["eod-counts", companyId, user?.id, today],
    enabled: !!companyId && !!user?.id,
    queryFn: async () => {
      const [{ data: tasks }, { data: visits }, { data: activities }, { data: existing }] = await Promise.all([
        supabase
          .from("tms_tasks")
          .select("id,title,scheduled_date,tms_task_statuses(is_terminal,name)")
          .eq("company_id", companyId!)
          .eq("scheduled_date", today)
          .eq("created_by", user!.id)
          .is("deleted_at", null),
        supabase
          .from("customer_visits")
          .select("id,customer_name")
          .eq("user_id", user!.id)
          .gte("meeting_at", `${today}T00:00:00`)
          .lte("meeting_at", `${today}T23:59:59`),
        supabase
          .from("crm_lead_activities")
          .select("id, activity_type")
          .eq("user_id", user!.id)
          .gte("occurred_at", `${today}T00:00:00`)
          .lte("occurred_at", `${today}T23:59:59`),
        supabase
          .from("eod_summaries")
          .select("*")
          .eq("user_id", user!.id)
          .eq("summary_date", today)
          .maybeSingle(),
      ]);
      const all = (tasks ?? []) as any[];
      const completed = all.filter((t) => t.tms_task_statuses?.is_terminal);
      const deferred = all.filter((t) => !t.tms_task_statuses?.is_terminal);
      return {
        completed,
        deferred,
        visits: visits ?? [],
        activities: activities ?? [],
        existing,
      };
    },
  });

  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(summary.data?.existing?.rep_notes ?? ""); }, [summary.data?.existing?.rep_notes]);

  const autoSummary = useMemo(() => {
    const d = summary.data;
    if (!d) return "";
    const parts: string[] = [];
    parts.push(`Completed ${d.completed.length} task${d.completed.length === 1 ? "" : "s"}.`);
    if (d.deferred.length) parts.push(`${d.deferred.length} pending/deferred.`);
    if (d.visits.length) parts.push(`Logged ${d.visits.length} customer visit${d.visits.length === 1 ? "" : "s"}.`);
    if (d.activities.length) parts.push(`${d.activities.length} CRM update${d.activities.length === 1 ? "" : "s"}.`);
    return parts.join(" ");
  }, [summary.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId || !user?.id) throw new Error("Pick a company first");
      const d = summary.data!;
      const payload = {
        company_id: companyId,
        user_id: user.id,
        summary_date: today,
        summary_text: autoSummary,
        rep_notes: notes,
        tasks_completed: d.completed.length,
        tasks_deferred: d.deferred.length,
        visits_done: d.visits.length,
        submitted_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("eod_summaries").upsert(payload, { onConflict: "user_id,summary_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("End-of-day summary saved");
      qc.invalidateQueries({ queryKey: ["eod-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="flex items-center gap-3">
          <Moon className="size-6" />
          <div>
            <h2 className="text-xl font-semibold">End of day wrap-up</h2>
            <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
          </div>
        </div>
      </Card>

      {summary.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Stat icon={CheckCircle2} label="Tasks completed" value={summary.data!.completed.length} color="text-emerald-500" />
          <Stat icon={CalendarClock} label="Deferred / pending" value={summary.data!.deferred.length} color="text-amber-500" />
          <Stat icon={MapPin} label="Visits logged" value={summary.data!.visits.length} color="text-blue-500" />
        </div>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Auto summary</h3>
        <p className="text-sm text-muted-foreground">{autoSummary || "—"}</p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-2">Your notes</h3>
        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything noteworthy — blockers, wins, follow-ups for tomorrow…" />
        <div className="flex gap-2 mt-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {summary.data?.existing ? <><RefreshCcw className="size-4 mr-2" /> Update summary</> : "Submit summary"}
          </Button>
          {summary.data?.existing && (
            <span className="text-xs text-muted-foreground self-center">Last submitted {format(new Date(summary.data.existing.submitted_at), "p")}</span>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-muted"><Icon className={`size-5 ${color}`} /></div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
