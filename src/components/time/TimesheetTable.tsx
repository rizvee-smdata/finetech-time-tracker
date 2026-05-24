import { useMemo } from "react";
import { startOfWeek, addDays, format, isSameDay } from "date-fns";
import { TIME_CATEGORIES, type TimeEntry } from "@/lib/time/types";

export function TimesheetTable({ entries, weekStart }: { entries: TimeEntry[]; weekStart: Date }) {
  const start = useMemo(() => startOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  const grid = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const cat of TIME_CATEGORIES) {
      map[cat] = {};
      for (const d of days) map[cat][format(d, "yyyy-MM-dd")] = 0;
    }
    for (const e of entries) {
      const ed = new Date(e.startTime);
      for (const d of days) {
        if (isSameDay(ed, d)) {
          const key = format(d, "yyyy-MM-dd");
          if (map[e.category]) map[e.category][key] += e.duration / 60;
          break;
        }
      }
    }
    return map;
  }, [entries, days]);

  const maxCell = useMemo(() => {
    let m = 0;
    for (const cat of TIME_CATEGORIES)
      for (const d of days) m = Math.max(m, grid[cat][format(d, "yyyy-MM-dd")]);
    return m || 1;
  }, [grid, days]);

  const colTotals = days.map((d) => {
    const k = format(d, "yyyy-MM-dd");
    return TIME_CATEGORIES.reduce((s, c) => s + grid[c][k], 0);
  });

  const billableTotals = days.map((d) =>
    entries
      .filter((e) => isSameDay(new Date(e.startTime), d) && e.billable)
      .reduce((s, e) => s + e.duration / 60, 0),
  );

  const fmt = (h: number) => (h > 0 ? h.toFixed(1) : "—");

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30">
            <th className="px-3 py-2 text-left font-medium">Category</th>
            {days.map((d) => (
              <th key={d.toISOString()} className="px-2 py-2 text-center font-medium">
                <div className="text-[11px] text-muted-foreground">{format(d, "EEE")}</div>
                <div className="text-xs">{format(d, "d MMM")}</div>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {TIME_CATEGORIES.map((cat) => {
            const rowTotal = days.reduce((s, d) => s + grid[cat][format(d, "yyyy-MM-dd")], 0);
            return (
              <tr key={cat} className="border-b border-border/30">
                <td className="px-3 py-2 font-medium">{cat}</td>
                {days.map((d) => {
                  const v = grid[cat][format(d, "yyyy-MM-dd")];
                  const intensity = v / maxCell;
                  return (
                    <td key={d.toISOString()} className="p-1 text-center font-mono tabular-nums" style={{ backgroundColor: v > 0 ? `rgba(139, 92, 246, ${0.15 + intensity * 0.5})` : undefined }}>
                      {fmt(v)}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{fmt(rowTotal)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-emerald-500/40 bg-emerald-500/5">
            <td className="px-3 py-2 font-semibold text-emerald-400">Billable subtotal</td>
            {billableTotals.map((b, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono font-semibold tabular-nums text-emerald-400">{fmt(b)}</td>
            ))}
            <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-400">{fmt(billableTotals.reduce((a, b) => a + b, 0))}</td>
          </tr>
          <tr className="bg-muted/30">
            <td className="px-3 py-2 font-semibold">Day total</td>
            {colTotals.map((c, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono font-semibold tabular-nums">{fmt(c)}</td>
            ))}
            <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">{fmt(colTotals.reduce((a, b) => a + b, 0))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
