import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDealPredictions } from "@/lib/visit-analytics/predictor.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/visits/predictions")({
  component: PredictionsPage,
});

function PredictionsPage() {
  const fn = useServerFn(getDealPredictions);
  const { data, isLoading } = useQuery({
    queryKey: ["visit-deal-predictions"],
    queryFn: () => fn({ data: {} }),
  });

  const rows = data?.predictions ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Deal Outcome Predictions</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        AI-estimated win probability and ETA based on visit cadence, quality, and stage velocity.
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Computing predictions…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No open deals to predict.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.lead_id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{r.customer_name}</CardTitle>
                  <div className="text-xs text-muted-foreground capitalize mt-1">{r.stage.replace("_", " ")}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold flex items-center gap-1 justify-end">
                    <TrendingUp className="h-4 w-4" />{r.win_probability}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ৳{r.expected_value.toLocaleString("en-IN")}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2 space-y-2">
                <Progress value={r.win_probability} className="h-2" />
                <div className="flex flex-wrap gap-1.5">
                  {r.signals.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] font-normal">{s}</Badge>
                  ))}
                </div>
                {r.predicted_close_days !== null && (
                  <div className="text-xs text-muted-foreground">
                    Estimated close: ~{r.predicted_close_days} days
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
