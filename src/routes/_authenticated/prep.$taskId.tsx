import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertTriangle, ClipboardCopy, MapPin, RefreshCw, Sparkles, Clock, Building2,
  CheckCircle2, ListChecks, MessageSquare, Lightbulb, History, Printer, Phone, Calendar,
} from "lucide-react";
import {
  generateMeetingPrep, getBriefByTaskId, markPrepared, healthColor, countdownString,
  type MeetingPrepBriefRow,
} from "@/lib/meetingPrep";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/prep/$taskId")({
  component: PrepPage,
});

function PrepPage() {
  const { taskId } = useParams({ from: "/_authenticated/prep/$taskId" });
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const taskQuery = useQuery({
    queryKey: ["prep-task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tms_tasks")
        .select("id, title, description, category, scheduled_date, scheduled_time, lead_id, company_id, crm_leads(id, customer_name, company_name, phone, email, address_text)")
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const briefQuery = useQuery({
    queryKey: ["prep-brief", taskId],
    queryFn: () => getBriefByTaskId(taskId),
    refetchInterval: (q) => (q.state.data?.status === "ready" ? false : 4000),
  });

  const generate = useMutation({
    mutationFn: (force: boolean) => generateMeetingPrep(taskId, force),
    onSuccess: () => {
      toast.success("Brief ready");
      qc.invalidateQueries({ queryKey: ["prep-brief", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prepared = useMutation({
    mutationFn: (id: string) => markPrepared(id),
    onSuccess: () => {
      toast.success("Marked as prepared");
      qc.invalidateQueries({ queryKey: ["prep-brief", taskId] });
    },
  });

  // Auto-trigger generation if missing
  useEffect(() => {
    if (briefQuery.data === null && !generate.isPending) {
      generate.mutate(false);
    }
  }, [briefQuery.data]);

  const task = taskQuery.data as any;
  const row = briefQuery.data as MeetingPrepBriefRow | null;
  const brief = row?.brief;

  const scheduledAt = useMemo(() => {
    if (!task?.scheduled_date) return null;
    return `${task.scheduled_date}T${task.scheduled_time ?? "09:00:00"}`;
  }, [task]);

  const lead = task?.crm_leads as any;
  const clientName = lead?.company_name || lead?.customer_name || task?.title || "Client";
  const countdown = countdownString(scheduledAt);

  if (taskQuery.isLoading) {
    return <div className="p-4 max-w-2xl mx-auto"><Skeleton className="h-40" /></div>;
  }
  if (!task) {
    return <div className="p-4 max-w-2xl mx-auto text-center text-muted-foreground">Task not found.</div>;
  }

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto space-y-4 print:p-0 print:max-w-none">
      {/* Header */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-l-4 border-l-primary print:border print:bg-white">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-lg bg-primary/15 grid place-items-center text-primary shrink-0">
            <Building2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-0.5">Pre-Visit Brief</div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight truncate">{clientName}</h1>
            {lead?.customer_name && lead?.company_name && (
              <div className="text-sm text-muted-foreground mt-0.5">{lead.customer_name}</div>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              {scheduledAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3" />
                  {format(new Date(scheduledAt), "EEE, MMM d • h:mm a")}
                </span>
              )}
              {countdown && (
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  <Clock className="size-3" />{countdown}
                </span>
              )}
              {brief?.relationship_health && (
                <Badge className={healthColor(brief.relationship_health)}>{brief.relationship_health}</Badge>
              )}
            </div>
          </div>
        </div>
        {brief?.one_key_priority && (
          <div className="mt-4 p-3 rounded-md bg-background/70 border">
            <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1 inline-flex items-center gap-1">
              <Sparkles className="size-3" /> Key priority
            </div>
            <div className="text-sm font-medium">{brief.one_key_priority}</div>
          </div>
        )}
      </Card>

      {/* Loading / failed states */}
      {!brief && row?.status === "pending" && (
        <Card className="p-6 text-center">
          <Sparkles className="size-6 mx-auto text-primary animate-pulse" />
          <div className="mt-2 text-sm">Preparing your brief…</div>
          <div className="text-xs text-muted-foreground">This takes about 10 seconds.</div>
        </Card>
      )}
      {row?.status === "failed" && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="text-sm font-medium text-destructive flex items-center gap-2">
            <AlertTriangle className="size-4" /> Generation failed
          </div>
          {row.error && <div className="mt-1 text-xs text-muted-foreground">{row.error}</div>}
          <Button size="sm" className="mt-3" onClick={() => generate.mutate(true)} disabled={generate.isPending}>
            <RefreshCw className="size-3 mr-1" /> Retry
          </Button>
        </Card>
      )}

      {brief && (
        <>
          {/* 1. Snapshot Summary */}
          <Section icon={<Sparkles className="size-4" />} title="Situation Summary">
            <p className="text-sm leading-relaxed">{brief.snapshot_summary}</p>
          </Section>

          {/* 2. Open Items */}
          {brief.open_items.length > 0 && (
            <Section icon={<ListChecks className="size-4" />} title="Open Items">
              <ul className="space-y-2">
                {brief.open_items.map((it, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-primary mt-1">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 3. Suggested Questions */}
          {brief.suggested_questions.length > 0 && (
            <Section icon={<MessageSquare className="size-4" />} title="Suggested Questions">
              <ol className="space-y-2 list-decimal pl-5">
                {brief.suggested_questions.map((q, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-start gap-2 justify-between">
                      <span className="flex-1">{q}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 print:hidden"
                        onClick={() => { navigator.clipboard.writeText(q); toast.success("Copied"); }}
                      >
                        <ClipboardCopy className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* 4. Talking Points */}
          {brief.talking_points.length > 0 && (
            <Section icon={<Lightbulb className="size-4" />} title="Talking Points">
              <div className="grid gap-2">
                {brief.talking_points.map((p, i) => (
                  <div key={i} className="p-3 rounded-md border bg-card">
                    <div className="text-sm font-medium mb-1">{p.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{p.rationale}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 5. Risk Flags */}
          {brief.risk_flags.length > 0 && (
            <Section icon={<AlertTriangle className="size-4 text-amber-500" />} title="Risk Flags">
              <div className="space-y-2">
                {brief.risk_flags.map((r, i) => (
                  <div key={i} className="p-3 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 text-sm">
                    {r}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 6. Timeline */}
          <TimelineSection aggregated={row?.aggregated_data} />

          {/* Bottom actions */}
          <div className="flex flex-col sm:flex-row gap-2 sticky bottom-3 print:hidden">
            <Link to="/gps/checkin" className="flex-1">
              <Button className="w-full" size="lg">
                <MapPin className="size-4 mr-1" /> Start Visit
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => row && prepared.mutate(row.id)}
              disabled={!row || prepared.isPending}
            >
              <CheckCircle2 className="size-4 mr-1" />
              {row?.prepared_at ? "Prepared ✓" : "I'm Prepared"}
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground print:hidden pt-2">
            <Link to="/prep/history" className="inline-flex items-center gap-1 hover:underline">
              <History className="size-3" /> Past briefs
            </Link>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-1 hover:underline" onClick={() => window.print()}>
                <Printer className="size-3" /> Print
              </button>
              <button className="inline-flex items-center gap-1 hover:underline" onClick={() => generate.mutate(true)}>
                <RefreshCw className="size-3" /> Regenerate
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 inline-flex items-center gap-1.5 font-medium">
        {icon} {title}
      </div>
      {children}
    </Card>
  );
}

function TimelineSection({ aggregated }: { aggregated: any }) {
  const visits = (aggregated?.visits ?? []) as any[];
  const activities = (aggregated?.activities ?? []) as any[];
  const items = [
    ...visits.map((v) => ({
      kind: "visit",
      date: v.meeting_at,
      title: v.customer_name || "Visit",
      summary: v.ai_summary || v.discussion_summary || v.next_action || "",
    })),
    ...activities.map((a) => ({
      kind: a.activity_type,
      date: a.occurred_at,
      title: a.title || a.activity_type,
      summary: a.body || "",
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  if (items.length === 0) return null;

  return (
    <Section icon={<History className="size-4" />} title="Recent Timeline">
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {items.map((it, i) => (
          <div key={i} className="min-w-[200px] max-w-[220px] p-3 rounded-md border bg-card shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {format(new Date(it.date), "MMM d")} • {it.kind}
            </div>
            <div className="text-xs font-medium mt-1 line-clamp-1">{it.title}</div>
            {it.summary && <div className="text-xs text-muted-foreground mt-1 line-clamp-3">{it.summary}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}
