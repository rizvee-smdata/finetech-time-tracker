import { useMemo } from "react";
import { startOfWeek, addDays, format, isSameDay, subDays } from "date-fns";
import type { TimeEntry } from "@/lib/time/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ProductivityHeatmap({ entries }: { entries: TimeEntry[] }) {
  const cells = useMemo(() => {
    const end = startOfWeek(new Date(), { weekStartsOn: 1 });
    const start = subDays(end, 12 * 7);
    const days: { date: Date; hours: number; top: string }[] = [];
    for (let i = 0; i < 12 * 7; i++) {
      const d = addDays(start, i);
      const dayEntries = entries.filter((e) => isSameDay(new Date(e.startTime), d));
      const hours = dayEntries.reduce((s, e) => s + e.duration / 60, 0);
      const byCat = new Map<string, number>();
      for (const e of dayEntries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.duration);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      days.push({ date: d, hours, top });
    }
    return days;
  }, [entries]);

  const maxH = Math.max(...cells.map((c) => c.hours), 1);

  function color(h: number) {
    if (h === 0) return "bg-muted/30";
    const ratio = h / maxH;
    if (ratio < 0.25) return "bg-emerald-900/60";
    if (ratio < 0.5) return "bg-emerald-700/70";
    if (ratio < 0.75) return "bg-emerald-500/80";
    return "bg-emerald-400";
  }

  // 7 rows (Mon-Sun) × 12 cols
  const grid: typeof cells[] = Array.from({ length: 7 }, () => []);
  cells.forEach((c, i) => {
    const row = i % 7;
    grid[row].push(c);
  });

  return (
    <TooltipProvider>
      <div className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Productivity — last 12 weeks</span>
          <div className="flex items-center gap-1.5">
            <span>Less</span>
            <div className="h-2.5 w-2.5 rounded-sm bg-muted/30" />
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-900/60" />
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-700/70" />
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
            <span>More</span>
          </div>
        </div>
        <div className="space-y-1">
          {grid.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map((c) => (
                <Tooltip key={c.date.toISOString()}>
                  <TooltipTrigger asChild>
                    <div className={`h-3.5 w-3.5 rounded-sm ${color(c.hours)}`} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-medium">{format(c.date, "EEE, d MMM")}</div>
                      <div>{c.hours.toFixed(1)} hours</div>
                      <div className="text-muted-foreground">Top: {c.top}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
