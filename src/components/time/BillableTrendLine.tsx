import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { startOfWeek, addDays, format, isWithinInterval, subDays } from "date-fns";
import type { TimeEntry, DailyTarget } from "@/lib/time/types";

export function BillableTrendLine({ entries, target }: { entries: TimeEntry[]; target: DailyTarget }) {
  const data = useMemo(() => {
    const start = startOfWeek(subDays(new Date(), 7 * 7), { weekStartsOn: 1 });
    const weeks: { week: string; billable: number; nonBillable: number }[] = [];
    for (let i = 0; i < 8; i++) {
      const ws = addDays(start, i * 7);
      const we = addDays(ws, 6);
      const inWk = entries.filter((e) => isWithinInterval(new Date(e.startTime), { start: ws, end: we }));
      weeks.push({
        week: format(ws, "d MMM"),
        billable: +(inWk.filter((e) => e.billable).reduce((s, e) => s + e.duration / 60, 0)).toFixed(1),
        nonBillable: +(inWk.filter((e) => !e.billable).reduce((s, e) => s + e.duration / 60, 0)).toFixed(1),
      });
    }
    return weeks;
  }, [entries]);

  const weeklyTarget = target.billableHours * 5;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="mb-2 text-sm font-semibold">Billable hours trend — last 8 weeks</h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="week" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #333", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={weeklyTarget} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: `Target ${weeklyTarget}h`, fill: "#F59E0B", fontSize: 10, position: "right" }} />
            <Line type="monotone" dataKey="billable" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="nonBillable" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
