import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getVisitsAwaitingConfirmation,
  queueVisitConfirmation,
} from "@/lib/visit-analytics/whatsapp-confirm.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, CheckCircle2, Phone, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/confirmations")({
  component: VisitConfirmationsPage,
});

function VisitConfirmationsPage() {
  const fetchUpcoming = useServerFn(getVisitsAwaitingConfirmation);
  const queueFn = useServerFn(queueVisitConfirmation);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["visit-confirmations"],
    queryFn: () => fetchUpcoming({ data: { hours: 24 } }),
  });

  const mutation = useMutation({
    mutationFn: (visit_id: string) => queueFn({ data: { visit_id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Confirmation queued");
        qc.invalidateQueries({ queryKey: ["visit-confirmations"] });
      } else {
        toast.error(res.error ?? "Failed to queue");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6" /> WhatsApp Visit Confirmations
        </h1>
        <p className="text-sm text-muted-foreground">
          Send confirmation reminders for visits scheduled in the next 24 hours.
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading upcoming visits…</p>}

      {!isLoading && data && data.visits.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No visits scheduled in the next 24 hours.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data?.visits ?? []).map((v) => {
          const when = new Date(v.meeting_at);
          return (
            <Card key={v.visit_id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{v.customer_name}</CardTitle>
                  {v.already_confirmed ? (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Sent
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                {v.company && (
                  <p className="text-xs text-muted-foreground">{v.company}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {when.toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {v.contact_number ?? "No phone"}
                </div>
                {v.rep_name && (
                  <p className="text-xs text-muted-foreground">Rep: {v.rep_name}</p>
                )}
                <Button
                  size="sm"
                  className="w-full mt-2"
                  disabled={
                    v.already_confirmed ||
                    !v.contact_number ||
                    mutation.isPending
                  }
                  onClick={() => mutation.mutate(v.visit_id)}
                >
                  {v.already_confirmed ? "Already sent" : "Send confirmation"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
