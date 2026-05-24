import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import type { Deal } from "@/lib/deals/types";

export function PipelineMovementChart({ deals }: { deals: Deal[] }) {
  // Use deal interactions in last 30 days as a movement proxy
  const since = Date.now() - 30 * 86400000;
  const data = deals.filter((d) => d.stage !== "Closed Lost").map((d) => {
    const recent = d.interactions.filter((i) => new Date(i.date).getTime() >= since);
    const positives = recent.filter((i) => i.sentiment === "positive").length;
    const negatives = recent.filter((i) => i.sentiment === "negative").length;
    const movement = positives - negatives;
    return {
      name: d.clientCompany.slice(0, 14),
      movement,
      kind: movement > 0 ? "forward" : movement < 0 ? "back" : "stalled",
    };
  }).sort((a, b) => b.movement - a.movement).slice(0, 8);

  const colors: Record<string, string> = { forward: "#10B981", back: "#EF4444", stalled: "#94A3B8" };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="mb-2 text-sm font-semibold">Pipeline movement — this month</h3>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-30} textAnchor="end" height={50} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #333", borderRadius: 6 }} />
            <Bar dataKey="movement">
              {data.map((d, i) => <Cell key={i} fill={colors[d.kind]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
        <span>🟢 Forward</span><span>🔴 Back</span><span>⚪ Stalled</span>
      </div>
    </div>
  );
}
