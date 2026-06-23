import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getVisitAnomalies } from "@/lib/visit-analytics/anomalies.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/anomalies")({
  component: AnomaliesPage,
});

const sevClass = (s: string) =>
  s === "high"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : s === "medium"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-slate-500/15 text-slate-700 dark:text-slate-300";

function AnomaliesPage() {
  const fn = useServerFn(getVisitAnomalies);
  const { data, isLoading } = useQuery({
    queryKey: ["visit-anomalies"],
    queryFn: () => fn({ data: {} }),
  });

  const rows = data?.anomalies ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Visit Anomaly Detector</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Cadence drops, quality streaks, and inactive reps detected from the last 14 days.
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Scanning…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No anomalies detected. ✨</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((a, i) => (
            <Card key={i}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <div className="text-xs text-muted-foreground mt-1 capitalize">{a.kind.replace(/_/g, " ")}</div>
                </div>
                <Badge className={sevClass(a.severity)}>{a.severity}</Badge>
              </CardHeader>
              <CardContent className="pt-2 text-sm">{a.description}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
