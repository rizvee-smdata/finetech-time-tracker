import { Activity, AlertTriangle, DollarSign, Target } from "lucide-react";
import type { Deal } from "@/lib/deals/types";

function metric(label: string, value: string, icon: React.ReactNode, accent: string) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-4 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={accent}>{icon}</div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function PipelineSummary({ deals }: { deals: Deal[] }) {
  const open = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
  const totalPipeline = open.reduce((s, d) => s + (d.dealValue || 0), 0);
  const attention = open.filter(
    (d) => d.healthScore && (d.healthScore.status === "at_risk" || d.healthScore.status === "stalling"),
  ).length;
  const avgScore =
    open.length > 0
      ? Math.round(
          open.reduce((s, d) => s + (d.healthScore?.score ?? 0), 0) / open.length,
        )
      : 0;
  const closingThisMonth = open.filter((d) => d.stage === "Negotiation");
  const closingValue = closingThisMonth.reduce((s, d) => s + (d.dealValue || 0), 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metric(
        "Total Pipeline",
        totalPipeline.toLocaleString(),
        <DollarSign className="h-4 w-4" />,
        "text-emerald-400",
      )}
      {metric(
        "Needs Attention",
        String(attention),
        <AlertTriangle className="h-4 w-4" />,
        "text-amber-400",
      )}
      {metric(
        "Avg Health Score",
        `${avgScore}`,
        <Activity className="h-4 w-4" />,
        "text-blue-400",
      )}
      {metric(
        "Projected (Negotiation)",
        closingValue.toLocaleString(),
        <Target className="h-4 w-4" />,
        "text-purple-400",
      )}
    </div>
  );
}
