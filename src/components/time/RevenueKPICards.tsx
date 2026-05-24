import { Card } from "@/components/ui/card";
import type { TimeEntry } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";
import { formatDealValue } from "@/lib/deals/types";

function hoursByDeal(entries: TimeEntry[]) {
  const m = new Map<string, number>();
  for (const e of entries) if (e.dealId) m.set(e.dealId, (m.get(e.dealId) ?? 0) + e.duration / 60);
  return m;
}

export function RevenueKPICards({ entries, deals }: { entries: TimeEntry[]; deals: Deal[] }) {
  const totalHours = entries.reduce((s, e) => s + e.duration / 60, 0);
  const activeDeals = deals.filter((d) => d.stage !== "Closed Lost");
  const pipelineValue = activeDeals.reduce((s, d) => s + d.dealValue, 0);
  const revPerHour = totalHours > 0 ? pipelineValue / totalHours : 0;

  const hours = hoursByDeal(entries);
  let bestRatio = 0;
  let bestDeal: Deal | undefined;
  for (const d of activeDeals) {
    const h = hours.get(d.id) ?? 0;
    if (h > 0 && d.dealValue / h > bestRatio) { bestRatio = d.dealValue / h; bestDeal = d; }
  }

  let worstRatio = Infinity;
  let timeSink: Deal | undefined;
  for (const d of activeDeals) {
    const h = hours.get(d.id) ?? 0;
    const score = d.healthScore?.score ?? 50;
    if (h >= 5 && score < 60) {
      const ratio = d.dealValue / h;
      if (ratio < worstRatio) { worstRatio = ratio; timeSink = d; }
    }
  }

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthEntries = entries.filter((e) => new Date(e.startTime) >= monthStart);
  const monthBill = monthEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration, 0);
  const monthTotal = monthEntries.reduce((s, e) => s + e.duration, 0);
  const billRatio = monthTotal > 0 ? Math.round((monthBill / monthTotal) * 100) : 0;

  const currency = (deals[0]?.currency ?? "USD") as "USD" | "BDT";

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <KPI label="Revenue per hour" value={revPerHour > 0 ? formatDealValue({ dealValue: Math.round(revPerHour), currency }) : "—"} sub="Pipeline ÷ hours logged" tone="violet" />
      <KPI label="Most profitable client" value={bestDeal?.clientCompany ?? "—"} sub={bestDeal ? `${formatDealValue({ dealValue: Math.round(bestRatio), currency })} per hour` : "Log time linked to deals"} tone="emerald" />
      <KPI label="Time sink alert" value={timeSink?.clientCompany ?? "—"} sub={timeSink ? `${(hours.get(timeSink.id) ?? 0).toFixed(1)} hrs · health ${timeSink.healthScore?.score ?? "?"}` : "All deals tracking well"} tone="red" />
      <KPI label="Billable ratio this month" value={`${billRatio}%`} sub={`${(monthBill / 60).toFixed(1)} / ${(monthTotal / 60).toFixed(1)} hrs`} tone="amber" />
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "violet" | "emerald" | "red" | "amber" }) {
  const colors = {
    violet: "from-violet-500/20 border-violet-500/40 text-violet-300",
    emerald: "from-emerald-500/20 border-emerald-500/40 text-emerald-300",
    red: "from-red-500/20 border-red-500/40 text-red-300",
    amber: "from-amber-500/20 border-amber-500/40 text-amber-300",
  }[tone];
  return (
    <Card className={`border bg-gradient-to-br ${colors} to-transparent p-4`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold truncate">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}
