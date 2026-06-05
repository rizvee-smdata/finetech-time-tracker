import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { History } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { getPredictionHistory, fmtBdt } from "@/lib/predictor";

export const Route = createFileRoute("/_authenticated/predictor/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const { data: history = [] } = useQuery({
    queryKey: ["prediction-history", user?.id],
    enabled: !!user?.id,
    queryFn: () => getPredictionHistory(user!.id, 90),
  });

  // Group by period_start (one chart series per month) — show prediction vs actual achieved per run_date
  const chartData = [...history].reverse().map((p) => ({
    date: p.run_date,
    Predicted: Math.round(Number(p.predicted_revenue)),
    Achieved: Math.round(Number(p.achieved_value)),
    Target: Math.round(Number(p.target_value)),
  }));

  // Accuracy: |predicted - achieved| / target for predictions in past periods (period_end < today)
  const today = new Date().toISOString().slice(0, 10);
  const settled = history.filter((p) => p.period_end < today);
  const accuracy = settled.length > 0
    ? Math.round(100 - (settled.reduce((s, p) => {
        const err = Math.abs(Number(p.predicted_revenue) - Number(p.achieved_value)) / Math.max(1, Number(p.target_value));
        return s + err;
      }, 0) / settled.length) * 100)
    : null;

  return (
    <div className="container mx-auto max-w-6xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> Prediction History
        </h1>
        <p className="text-sm text-muted-foreground">
          {accuracy != null ? `Forecast accuracy on settled months: ${accuracy}%` : "Accuracy will appear after at least one closed month."}
        </p>
      </div>

      <Card className="p-5">
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(1)}L` : `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => fmtBdt(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="Target" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Predicted" stroke="hsl(var(--primary))" strokeWidth={2} dot />
              <Line type="monotone" dataKey="Achieved" stroke="hsl(var(--success))" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div className="divide-y divide-border">
          {history.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="font-medium">{new Date(p.run_date).toLocaleDateString()}</div>
                <div className="text-xs text-muted-foreground">Period {p.period_start} → {p.period_end}</div>
              </div>
              <div className="grid grid-cols-3 gap-6 text-right">
                <div>
                  <div className="text-xs text-muted-foreground">Predicted</div>
                  <div className="font-semibold">{fmtBdt(Number(p.predicted_revenue))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Achieved</div>
                  <div className="font-semibold">{fmtBdt(Number(p.achieved_value))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">%</div>
                  <div className="font-semibold">{p.achievement_pct}%</div>
                </div>
              </div>
            </div>
          ))}
          {history.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No predictions yet.</div>}
        </div>
      </Card>
    </div>
  );
}
