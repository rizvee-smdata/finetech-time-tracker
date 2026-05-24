import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import type { TimeEntry } from "@/lib/time/types";
import { CATEGORY_COLORS, TIME_CATEGORIES, type TimeCategory } from "@/lib/time/types";

const CLIENT_FACING: TimeCategory[] = ["Client Meeting", "Technical Demo", "Pre-Sales", "Proposal Writing", "Follow-up"];

export function CategoryDonut({ entries }: { entries: TimeEntry[] }) {
  const data = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.category, (m.get(e.category) ?? 0) + e.duration);
    return TIME_CATEGORIES.map((c) => ({ name: c, value: +(m.get(c) ?? 0) / 60 }))
      .filter((d) => d.value > 0);
  }, [entries]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const clientFacing = data.filter((d) => CLIENT_FACING.includes(d.name as TimeCategory)).reduce((s, d) => s + d.value, 0);
  const clientPct = total > 0 ? Math.round((clientFacing / total) * 100) : 0;
  const benchmark = 40;
  const adminPct = total > 0 ? Math.round((data.find((d) => d.name === "Admin")?.value ?? 0) / total * 100) : 0;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="mb-2 text-sm font-semibold">Time distribution by category</h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {data.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.name as TimeCategory]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => `${v.toFixed(1)} h`} contentStyle={{ background: "#0d1117", border: "1px solid #333", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
        <div>BD best practice: <strong>{benchmark}% client-facing</strong>. You're at <strong className="text-amber-300">{clientPct}%</strong>.</div>
        {adminPct > 20 && <div className="mt-1 text-amber-300">You spent {adminPct}% on Admin — {adminPct - 20}% above recommended.</div>}
      </div>
    </div>
  );
}
