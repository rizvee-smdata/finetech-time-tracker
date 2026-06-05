import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreGauge } from "@/components/scorecard/ScoreGauge";
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Target as TargetIcon, Loader2, Zap, History } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend, CartesianGrid } from "recharts";
import {
  generatePrediction,
  getLatestPrediction,
  fmtBdt,
  riskBand,
  simulateClose,
  type PredictionRun,
} from "@/lib/predictor";

export const Route = createFileRoute("/_authenticated/predictor/me")({
  component: PredictorMePage,
});

function PredictorMePage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();

  const { data: prediction, isLoading } = useQuery({
    queryKey: ["prediction-latest", user?.id],
    enabled: !!user?.id,
    queryFn: () => getLatestPrediction(user!.id),
  });

  const refresh = useMutation({
    mutationFn: () => generatePrediction(companyId!, user!.id, false),
    onSuccess: () => {
      toast.success("Prediction refreshed");
      qc.invalidateQueries({ queryKey: ["prediction-latest"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to generate"),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading prediction…</div>;
  }

  if (!prediction) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card className="p-8 text-center space-y-4">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">No prediction yet</h1>
          <p className="text-sm text-muted-foreground">
            Generate your first AI-powered month-end forecast. We'll use your current target,
            won deals, open pipeline, and historical close rate.
          </p>
          <Button
            disabled={!companyId || refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate prediction
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <PredictorContent
      prediction={prediction}
      onRefresh={() => refresh.mutate()}
      refreshing={refresh.isPending}
    />
  );
}

function PredictorContent({ prediction, onRefresh, refreshing }: {
  prediction: PredictionRun; onRefresh: () => void; refreshing: boolean;
}) {
  const [extraDealId, setExtraDealId] = useState<string>("none");
  const { user, companyId } = useAuth();

  // Fetch open deals for simulator
  const { data: openDeals = [] } = useQuery({
    queryKey: ["predictor-open-deals", user?.id, companyId],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const monthEnd = prediction.period_end;
      const { data } = await (supabase as any)
        .from("crm_leads")
        .select("id, customer_name, company_name, expected_value, probability")
        .eq("company_id", companyId)
        .eq("assigned_to", user!.id)
        .not("stage", "in", "(won,lost)")
        .lte("expected_close_date", monthEnd)
        .order("expected_value", { ascending: false })
        .limit(20);
      return (data ?? []) as Array<{ id: string; customer_name: string; company_name: string | null; expected_value: number; probability: number }>;
    },
  });

  const extra = openDeals.find((d) => d.id === extraDealId);
  const simulated = extra ? simulateClose(prediction, Number(extra.expected_value)) : null;

  const pct = prediction.achievement_pct;
  const band = riskBand(pct);
  const bandColor = band === "on_track" ? "text-success" : band === "at_risk" ? "text-warning" : "text-destructive";

  // Build trajectory chart
  const chartData = useMemo(() => {
    const total = prediction.inputs.total_working_days;
    const elapsed = prediction.inputs.days_elapsed;
    const target = prediction.target_value;
    const achieved = prediction.achieved_value;
    const predicted = Number(prediction.predicted_revenue);
    const closeRate = achieved / Math.max(1, elapsed);
    const remainingRate = Math.max(0, (predicted - achieved) / Math.max(1, total - elapsed));
    return Array.from({ length: total + 1 }, (_, day) => ({
      day,
      Target: Math.round((target / total) * day),
      Actual: day <= elapsed ? Math.round(closeRate * day) : null,
      Predicted: day < elapsed
        ? null
        : Math.round(achieved + remainingRate * Math.max(0, day - elapsed)),
    }));
  }, [prediction]);

  const avgDeal = prediction.inputs.avg_deal_size || 1;
  const dealsNeeded = Math.max(0, Math.ceil(prediction.gap_to_target / avgDeal));

  return (
    <div className="container mx-auto max-w-6xl py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Achievement Predictor
          </h1>
          <p className="text-sm text-muted-foreground">
            Forecast for {new Date(prediction.period_start).toLocaleDateString("en-US", { month: "long", year: "numeric" })} ·
            updated {new Date(prediction.generated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/predictor/history"><History className="mr-2 h-4 w-4" />History</Link>
          </Button>
          <Button variant="outline" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Gauge + headline */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 via-card to-card">
        <div className="flex flex-wrap items-center justify-around gap-6">
          <ScoreGauge score={Math.min(100, pct)} label="Predicted Achievement" />
          <div className="space-y-1 text-center md:text-left">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Target</div>
            <div className="text-2xl font-bold">{fmtBdt(prediction.target_value)}</div>
            <div className="text-xs text-muted-foreground mt-2">Achieved so far</div>
            <div className="text-lg font-semibold">{fmtBdt(prediction.achieved_value)}</div>
            <Badge variant="outline" className={bandColor}>
              {band === "on_track" ? "On Track" : band === "at_risk" ? "At Risk" : "Critical"}
            </Badge>
          </div>
          <div className="space-y-1 text-center md:text-left">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</div>
            <div className="text-2xl font-bold">{Math.round(prediction.confidence * 100)}%</div>
            <div className="text-xs text-muted-foreground mt-2">Gap to target</div>
            <div className={`text-lg font-semibold ${prediction.gap_to_target > 0 ? "text-warning" : "text-success"}`}>
              {prediction.gap_to_target > 0 ? fmtBdt(prediction.gap_to_target) : "Above target"}
            </div>
          </div>
        </div>
      </Card>

      {/* Scenario cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <ScenarioCard label="Worst Case" value={prediction.worst_case} color="destructive" hint="if current deals stall" icon={<TrendingDown className="h-4 w-4" />} />
        <ScenarioCard label="Likely" value={prediction.predicted_revenue} color="warning" hint="based on current trajectory" icon={<TargetIcon className="h-4 w-4" />} />
        <ScenarioCard label="Best Case" value={prediction.best_case} color="success" hint="if all pipeline closes" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {/* Trajectory chart */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue Trajectory</h2>
          <span className="text-xs text-muted-foreground">Working day {prediction.inputs.days_elapsed} / {prediction.inputs.total_working_days}</span>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => v == null ? "—" : fmtBdt(Number(v))} />
              <Legend />
              <ReferenceLine x={prediction.inputs.days_elapsed} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: "Today", fontSize: 10 }} />
              <Line type="monotone" dataKey="Target" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Actual" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Predicted" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Gap + Insight */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-2 border-warning/30">
          <div className="flex items-center gap-2 text-warning text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" /> Gap to Target
          </div>
          {prediction.gap_to_target > 0 ? (
            <p className="text-sm leading-relaxed">
              You need <strong>{fmtBdt(prediction.gap_to_target)}</strong> more.
              Based on your avg deal size of <strong>{fmtBdt(avgDeal)}</strong>, that means
              <strong> {dealsNeeded}</strong> more deal{dealsNeeded === 1 ? "" : "s"}.
              <br />
              Suggested: <strong>{prediction.required_additional_visits}</strong> visits +
              <strong> {prediction.required_additional_proposals}</strong> proposals this week.
            </p>
          ) : (
            <p className="text-sm text-success leading-relaxed">
              You're projected to exceed your target by {fmtBdt(Math.abs(prediction.gap_to_target))}. Keep the momentum.
            </p>
          )}
        </Card>

        <Card className="p-5 space-y-2 bg-gradient-to-br from-primary/5 to-card">
          <div className="flex items-center gap-2 text-primary text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> AI Insight
          </div>
          <p className="text-sm leading-relaxed">{prediction.recommendation}</p>
          <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
            <div>
              <div className="text-muted-foreground">Key driver</div>
              <div className="font-medium">{prediction.key_driver}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Main risk</div>
              <div className="font-medium">{prediction.risk_factor}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* What-if simulator */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">What if…</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={extraDealId} onValueChange={setExtraDealId}>
            <SelectTrigger className="w-full md:w-96"><SelectValue placeholder="Pick a deal to close" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select an open deal…</SelectItem>
              {openDeals.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {(d.company_name ?? d.customer_name)} — {fmtBdt(Number(d.expected_value))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {simulated && extra && (
            <Badge variant="outline" className="text-success">
              Closing {(extra.company_name ?? extra.customer_name)} jumps you from {pct}% → {simulated.achievement_pct}%
            </Badge>
          )}
        </div>
        {simulated && (
          <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">New predicted</div>
              <div className="font-semibold">{fmtBdt(simulated.predicted_revenue)}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">New gap</div>
              <div className={`font-semibold ${simulated.gap_to_target > 0 ? "text-warning" : "text-success"}`}>
                {simulated.gap_to_target > 0 ? fmtBdt(simulated.gap_to_target) : "Above target"}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">New achievement</div>
              <div className="font-semibold">{simulated.achievement_pct}%</div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ScenarioCard({ label, value, color, hint, icon }: {
  label: string; value: number; color: "success" | "warning" | "destructive"; hint: string; icon: React.ReactNode;
}) {
  const klass =
    color === "success" ? "border-success/40 text-success"
    : color === "warning" ? "border-warning/40 text-warning"
    : "border-destructive/40 text-destructive";
  return (
    <Card className={`p-5 border-2 ${klass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{fmtBdt(value)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}
