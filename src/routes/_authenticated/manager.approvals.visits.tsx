import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, AlertTriangle, MapPin, ClipboardCheck } from "lucide-react";
import { slaInfo, initialsOf } from "@/lib/manager/helpers";

export const Route = createFileRoute("/_authenticated/manager/approvals/visits")({
  component: VisitApprovalsPage,
});

function VisitApprovalsPage() {
  const { companyId, user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const list = useQuery({
    queryKey: ["mgr-visit-reports", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_reports")
        .select("id, user_id, report_date, summary_text, tasks_completed, visits_done, clients_visited, submitted_at, status, profiles:user_id(full_name)")
        .eq("company_id", companyId!)
        .eq("status", "pending")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`mgr-vr-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_reports" }, () => {
        qc.invalidateQueries({ queryKey: ["mgr-visit-reports"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, qc]);

  const selected = (list.data ?? []).find((v: any) => v.id === selectedId);

  // load gps checkins for that rep on that day
  const checkins = useQuery({
    queryKey: ["mgr-vr-checkins", selected?.user_id, selected?.report_date],
    enabled: !!selected,
    queryFn: async () => {
      const start = `${selected!.report_date}T00:00:00`;
      const end = `${selected!.report_date}T23:59:59`;
      const { data, error } = await supabase
        .from("visit_checkins")
        .select("id, lat, lng, checked_in_at, geofence_valid, distance_from_client_m, crm_leads(customer_name)")
        .eq("user_id", selected!.user_id)
        .gte("checked_in_at", start)
        .lte("checked_in_at", end)
        .order("checked_in_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const { error } = await supabase
        .from("visit_reports")
        .update({
          status: "reviewed",
          manager_comment: comment || null,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("approval_logs").insert({
        company_id: companyId!,
        entity_type: "visit_report",
        entity_id: id,
        action: "reviewed",
        actor_id: user!.id,
        comments: comment || null,
      });
    },
    onSuccess: () => {
      toast.success("Report marked as reviewed");
      setSelectedId(null);
      setComment("");
      qc.invalidateQueries({ queryKey: ["mgr-visit-reports"] });
      qc.invalidateQueries({ queryKey: ["manager-kpis"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col border-r border-border">
        <div className="border-b border-border bg-card/40 p-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Pending Visit Reports</h2>
            <Badge variant="secondary">{list.data?.length ?? 0}</Badge>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {list.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : (list.data ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No pending reports</div>
          ) : (
            <ul className="space-y-2">
              {list.data!.map((v: any) => {
                const sla = slaInfo(v.submitted_at);
                const active = selectedId === v.id;
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => setSelectedId(v.id)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Avatar className="h-9 w-9"><AvatarFallback>{initialsOf(v.profiles?.full_name)}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{v.profiles?.full_name ?? "Rep"}</div>
                            <div className="text-xs text-muted-foreground">{format(new Date(v.report_date), "MMM d")}</div>
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {v.tasks_completed} tasks • {v.visits_done} visits
                          </div>
                          <div className="mt-1">
                            <Badge variant={sla.breached ? "destructive" : "outline"} className="text-[10px]">
                              {sla.breached && <AlertTriangle className="mr-1 h-3 w-3" />}
                              {sla.label}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-y-auto p-4 md:p-6">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a report to review
          </div>
        ) : (
          <Card className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-xs uppercase text-muted-foreground">EOD Report</div>
                <div className="text-xl font-bold">{format(new Date(selected.report_date), "PPPP")}</div>
                <div className="text-sm text-muted-foreground">{(selected as any).profiles?.full_name ?? "Rep"}</div>
              </div>
              <Badge variant={slaInfo(selected.submitted_at).breached ? "destructive" : "secondary"}>
                {slaInfo(selected.submitted_at).label}
              </Badge>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Tasks Completed</div>
                <div className="text-2xl font-bold">{selected.tasks_completed}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Visits Done</div>
                <div className="text-2xl font-bold">{selected.visits_done}</div>
              </div>
            </div>

            {selected.summary_text && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground">Summary</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{selected.summary_text}</p>
              </div>
            )}

            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> GPS Check-ins
              </div>
              {checkins.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (checkins.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No check-ins recorded</div>
              ) : (
                <ul className="space-y-1">
                  {checkins.data!.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                      <span>{c.crm_leads?.customer_name ?? "Location"} • {format(new Date(c.checked_in_at), "p")}</span>
                      <Badge variant={c.geofence_valid ? "default" : "destructive"} className="text-[10px]">
                        {c.geofence_valid ? "Valid" : `${Math.round(c.distance_from_client_m ?? 0)}m off`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mb-4">
              <Textarea
                placeholder="Manager comment (optional)…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={() => review.mutate({ id: selected.id, comment })}
              disabled={review.isPending}
            >
              <ClipboardCheck className="mr-2 h-5 w-5" /> Mark as Reviewed
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
