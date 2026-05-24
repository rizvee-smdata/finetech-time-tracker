import { Progress } from "@/components/ui/progress";
import type { TimeEntry, DailyTarget } from "@/lib/time/types";

function fmtH(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function TodaySummaryBar({ entries, target }: { entries: TimeEntry[]; target: DailyTarget }) {
  const total = entries.reduce((sum, e) => sum + e.duration, 0);
  const billable = entries.filter((e) => e.billable).reduce((sum, e) => sum + e.duration, 0);
  const nonBillable = total - billable;
  const billablePct = total > 0 ? Math.round((billable / total) * 100) : 0;
  const dayPct = Math.min(100, (total / 60 / target.totalHours) * 100);

  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.duration);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent p-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total today" value={fmtH(total)} accent="text-violet-300" />
        <Stat label="Billable" value={`${fmtH(billable)} (${billablePct}%)`} accent="text-emerald-400" />
        <Stat label="Non-billable" value={fmtH(nonBillable)} accent="text-muted-foreground" />
        <Stat label="Top category" value={top ? `${top[0]} (${fmtH(top[1])})` : "—"} accent="text-amber-400" />
      </div>
      <div className="mt-4 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Daily target: {target.totalHours}h</span>
          <span>{Math.round(dayPct)}%</span>
        </div>
        <Progress value={dayPct} className="h-2 [&>div]:bg-violet-500" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
