import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { isSameDay, subDays } from "date-fns";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Link as LinkIcon } from "lucide-react";
import { useTimeStore } from "@/lib/time/storage";
import { useDealsStore } from "@/lib/deals/storage";
import { useMeetingsStore } from "@/lib/meetings/storage";
import { HEALTH_COLORS, formatDealValue } from "@/lib/deals/types";
import { MiniTimerWidget } from "@/components/time/MiniTimerWidget";
import { DailyBriefingCard } from "@/components/time/DailyBriefingCard";
import { WeeklyActivityHeatmap } from "@/components/time/WeeklyActivityHeatmap";
import { PipelineMovementChart } from "@/components/time/PipelineMovementChart";
import { RevenueForecastGauge } from "@/components/time/RevenueForecastGauge";
import { ActivityFeed } from "@/components/time/ActivityFeed";

export const Route = createFileRoute("/_authenticated/time/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { entries } = useTimeStore();
  const { deals } = useDealsStore();
  const { meetings } = useMeetingsStore();

  const active = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
  const pipelineValue = active.reduce((s, d) => s + d.dealValue, 0);
  const counts = {
    healthy: active.filter((d) => d.healthScore?.status === "healthy").length,
    at_risk: active.filter((d) => d.healthScore?.status === "at_risk").length,
    stalling: active.filter((d) => d.healthScore?.status === "stalling").length,
  };
  const urgent = active.filter((d) => d.healthScore?.status === "stalling").slice(0, 3);
  const currency = (deals[0]?.currency ?? "USD") as "USD" | "BDT";

  const today = useMemo(() => entries.filter((e) => isSameDay(new Date(e.startTime), new Date())), [entries]);
  const yesterday = useMemo(() => entries.filter((e) => isSameDay(new Date(e.startTime), subDays(new Date(), 1))), [entries]);
  const todayMin = today.reduce((s, e) => s + e.duration, 0);
  const yesterdayMin = yesterday.reduce((s, e) => s + e.duration, 0);
  const billMin = today.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0);
  const monthlyTarget = pipelineValue > 0 ? Math.max(pipelineValue * 0.15, 1000000) : 1000000;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pipeline Health */}
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Pipeline Health</h3>
          <div className="text-3xl font-bold">{formatDealValue({ dealValue: pipelineValue, currency })}</div>
          <div className="text-xs text-muted-foreground mb-3">{active.length} active deals</div>
          <div className="flex gap-3 text-sm mb-4">
            <span className="text-emerald-400">🟢 {counts.healthy}</span>
            <span className="text-amber-400">🟡 {counts.at_risk}</span>
            <span className="text-red-400">🔴 {counts.stalling}</span>
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Urgent</div>
          <div className="space-y-2">
            {urgent.length === 0 && <div className="text-sm text-muted-foreground">All deals healthy.</div>}
            {urgent.map((d) => (
              <Link key={d.id} to={`/deals/${d.id}` as "/deals"} className="block rounded border border-red-500/30 bg-red-500/5 p-2 text-sm hover:bg-red-500/10">
                <div className="font-medium truncate">{d.clientCompany}</div>
                <div className="text-xs text-muted-foreground">Score {d.healthScore?.score} · {d.stage}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* Today's Focus */}
        <DailyBriefingCard entries={entries} deals={deals} />

        {/* Time Today */}
        <div className="space-y-3">
          <MiniTimerWidget />
          <div className="rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="text-sm font-semibold mb-2">Today</h3>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[
                    { name: "Billable", value: billMin },
                    { name: "Non-billable", value: Math.max(0, todayMin - billMin) },
                  ]} dataKey="value" innerRadius={30} outerRadius={50}>
                    <Cell fill="#10B981" /><Cell fill="#94A3B8" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center font-mono text-lg tabular-nums text-violet-300">{(todayMin / 60).toFixed(1)}h</div>
            <div className="text-center text-xs text-muted-foreground">vs yesterday {(yesterdayMin / 60).toFixed(1)}h</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WeeklyActivityHeatmap entries={entries} />
        <PipelineMovementChart deals={deals} />
        <RevenueForecastGauge deals={deals} monthlyTarget={monthlyTarget} />
      </div>

      <ActivityFeed entries={entries} deals={deals} meetings={meetings} />

      <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
        <LinkIcon className="h-3 w-3" />
        Unified view across Time, Meetings, and Deals modules.
      </div>
    </div>
  );
}
