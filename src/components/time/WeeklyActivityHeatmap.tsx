import { useMemo } from "react";
import { subDays } from "date-fns";
import type { TimeEntry } from "@/lib/time/types";

export function WeeklyActivityHeatmap({ entries }: { entries: TimeEntry[] }) {
  const grid = useMemo(() => {
    const since = subDays(new Date(), 28).getTime();
    const cells: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const e of entries) {
      const start = new Date(e.startTime);
      if (start.getTime() < since) continue;
      const dayIdx = (start.getDay() + 6) % 7; // Mon=0
      const hour = start.getHours();
      cells[dayIdx][hour] += e.duration / 60;
    }
    return cells;
  }, [entries]);

  const max = Math.max(...grid.flat(), 1);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="mb-2 text-sm font-semibold">When you work — last 4 weeks</h3>
      <div className="text-xs text-muted-foreground mb-2">Day × hour-of-day intensity</div>
      <div className="space-y-1">
        {grid.map((row, di) => (
          <div key={di} className="flex items-center gap-1">
            <div className="w-8 shrink-0 text-[10px] text-muted-foreground">{days[di]}</div>
            <div className="flex gap-0.5 flex-1">
              {row.map((v, hi) => {
                const ratio = v / max;
                const bg = v === 0
                  ? "rgba(255,255,255,0.04)"
                  : `rgba(139, 92, 246, ${0.2 + ratio * 0.7})`;
                return <div key={hi} className="h-4 flex-1 rounded-sm" title={`${days[di]} ${hi}:00 — ${v.toFixed(1)}h`} style={{ backgroundColor: bg }} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 pl-9 text-[9px] text-muted-foreground">
        {Array.from({ length: 24 }, (_, i) => i % 6 === 0 ? <div key={i} className="flex-1">{i}h</div> : <div key={i} className="flex-1" />)}
      </div>
    </div>
  );
}
