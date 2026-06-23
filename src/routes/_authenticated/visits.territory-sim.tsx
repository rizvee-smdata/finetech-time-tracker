import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTerritorySimulation } from "@/lib/visit-analytics/territory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Scale } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/territory-sim")({
  component: TerritorySimPage,
  errorComponent: ({ error }) => <div className="p-4 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-4">Not found</div>,
});

function TerritorySimPage() {
  const fn = useServerFn(getTerritorySimulation);
  const { data, isLoading } = useQuery({
    queryKey: ["visits", "territory-sim"],
    queryFn: () => fn({ data: { days: 30 } }),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Running simulation…</div>;
  const reps = data?.reps ?? [];
  const suggestions = data?.suggestions ?? [];
  const imbalance = data?.imbalance_pct ?? 0;
  const balanced = imbalance < 40;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Territory Rebalance Simulator</h1>
        <p className="text-sm text-muted-foreground">
          Workload imbalance: {imbalance.toFixed(0)}%{" "}
          <Badge variant={balanced ? "outline" : "destructive"} className="ml-1">
            {balanced ? "Balanced" : "Rebalance recommended"}
          </Badge>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" /> Rep Workload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2">Rep</th>
                  <th className="text-right">Accounts</th>
                  <th className="text-right">Open Pipeline</th>
                  <th className="text-right">Visits (30d)</th>
                  <th className="text-right">Stale</th>
                  <th className="text-right">Load Score</th>
                </tr>
              </thead>
              <tbody>
                {reps.map((r) => (
                  <tr key={r.user_id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.rep_name}</td>
                    <td className="text-right">{r.accounts}</td>
                    <td className="text-right">{r.open_pipeline.toLocaleString()}</td>
                    <td className="text-right">{r.visits_30d}</td>
                    <td className="text-right">{r.stale_accounts}</td>
                    <td className="text-right font-semibold">{r.load_score.toFixed(1)}</td>
                  </tr>
                ))}
                {reps.length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-muted-foreground text-center">No rep data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reassignment Suggestions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {suggestions.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No rebalance needed — workload is reasonably distributed.
            </div>
          )}
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <span>{s.from_name}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{s.to_name}</span>
                <Badge variant="outline" className="ml-auto text-xs">{s.account_name}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.reason}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
