import { useMemo } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis, ReferenceLine } from "recharts";
import type { TimeEntry } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";
import { HEALTH_COLORS } from "@/lib/deals/types";

export function HoursValueScatter({ entries, deals }: { entries: TimeEntry[]; deals: Deal[] }) {
  const data = useMemo(() => {
    const hours = new Map<string, number>();
    for (const e of entries) if (e.dealId) hours.set(e.dealId, (hours.get(e.dealId) ?? 0) + e.duration / 60);
    return deals
      .filter((d) => d.stage !== "Closed Lost")
      .map((d) => ({
        x: +(hours.get(d.id) ?? 0).toFixed(1),
        y: d.dealValue,
        name: d.clientCompany,
        status: d.healthScore?.status ?? "at_risk",
      }));
  }, [entries, deals]);

  const maxX = Math.max(...data.map((d) => d.x), 10);
  const maxY = Math.max(...data.map((d) => d.y), 1);
  const midX = maxX / 2;
  const midY = maxY / 2;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Hours vs Deal Value</h3>
        <span className="text-xs text-muted-foreground">Dot color = deal health</span>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis type="number" dataKey="x" name="Hours" unit="h" stroke="#94a3b8" />
            <YAxis type="number" dataKey="y" name="Value" stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <ZAxis range={[120, 120]} />
            <ReferenceLine x={midX} stroke="rgba(255,255,255,0.1)" />
            <ReferenceLine y={midY} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "#0d1117", border: "1px solid #333", borderRadius: 6 }}
              formatter={(v: number | string, n: string) => (n === "Value" ? [v.toLocaleString(), n] : [v, n])}
              labelFormatter={() => ""}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload as { name: string; x: number; y: number; status: keyof typeof HEALTH_COLORS };
                return (
                  <div className="rounded border border-border bg-card p-2 text-xs">
                    <div className="font-medium">{p.name}</div>
                    <div>{p.x} hrs · {p.y.toLocaleString()}</div>
                    <div className="text-muted-foreground">{HEALTH_COLORS[p.status].label}</div>
                  </div>
                );
              }}
            />
            <Scatter data={data} shape={(props: { cx?: number; cy?: number; payload?: { status: keyof typeof HEALTH_COLORS } }) => {
              const cx = props.cx ?? 0; const cy = props.cy ?? 0;
              const status = props.payload?.status ?? "at_risk";
              const color = HEALTH_COLORS[status].hex;
              return <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.85} stroke={color} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div>🏆 Top-left: High value, low effort</div>
        <div>⚠️ Top-right: High value, high effort</div>
        <div>✅ Bottom-left: Low value, low effort</div>
        <div>🚨 Bottom-right: Low value, high effort</div>
      </div>
    </div>
  );
}
