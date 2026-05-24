import type { Deal } from "@/lib/deals/types";

export function RevenueForecastGauge({ deals, monthlyTarget }: { deals: Deal[]; monthlyTarget: number }) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
  const forecast = deals.filter((d) => {
    const close = new Date(d.expectedCloseDate);
    return close >= monthStart && close < monthEnd && d.stage !== "Closed Lost";
  }).reduce((s, d) => s + d.dealValue * (d.probability / 100), 0);

  const won = deals.filter((d) => d.stage === "Closed Won" && new Date(d.expectedCloseDate) >= monthStart).reduce((s, d) => s + d.dealValue, 0);
  const total = won + forecast;
  const pct = Math.min(100, (total / monthlyTarget) * 100);
  const angle = -90 + (pct / 100) * 180;

  const status = pct >= 100 ? { label: "Ahead", color: "#10B981" } : pct >= 80 ? { label: "On track", color: "#F59E0B" } : { label: "Behind", color: "#EF4444" };

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-center">
      <h3 className="mb-2 text-sm font-semibold">Revenue forecast</h3>
      <svg viewBox="0 0 200 120" className="w-full max-w-[240px] mx-auto">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={status.color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 251.3} 251.3`}
          style={{ transition: "stroke-dasharray 0.8s" }}
        />
        <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)} y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
              stroke={status.color} strokeWidth="3" strokeLinecap="round" style={{ transition: "all 0.8s" }} />
        <circle cx="100" cy="100" r="5" fill={status.color} />
      </svg>
      <div className="text-2xl font-bold" style={{ color: status.color }}>{Math.round(pct)}%</div>
      <div className="text-xs text-muted-foreground">{(total / 1000).toFixed(0)}k / {(monthlyTarget / 1000).toFixed(0)}k forecast</div>
      <div className="mt-1 text-xs font-medium" style={{ color: status.color }}>{status.label}</div>
    </div>
  );
}
