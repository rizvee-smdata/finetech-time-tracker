// Performance scorecard helpers — weighted score, RAG, KPI definitions

export type KpiKey = "revenue" | "deals" | "visits" | "calls" | "demos" | "proposals";

export interface KpiDef {
  key: KpiKey;
  label: string;
  weight: number; // 0..1
  currency?: boolean;
}

export const KPI_DEFS: KpiDef[] = [
  { key: "revenue", label: "Revenue", weight: 0.40, currency: true },
  { key: "deals", label: "Deals Closed", weight: 0.25 },
  { key: "visits", label: "Client Visits", weight: 0.20 },
  { key: "proposals", label: "Proposals Sent", weight: 0.10 },
  { key: "calls", label: "Calls Made", weight: 0.05 },
  { key: "demos", label: "Demos Done", weight: 0.00 }, // displayed, not weighted
];

export type Rag = "red" | "amber" | "green" | "neutral";

export function ragOf(pct: number | null | undefined): Rag {
  if (pct == null || !isFinite(pct as number)) return "neutral";
  if (pct >= 85) return "green";
  if (pct >= 60) return "amber";
  return "red";
}

export function ragClasses(r: Rag) {
  switch (r) {
    case "green":
      return "bg-success/15 text-success border-success/30";
    case "amber":
      return "bg-warning/15 text-warning border-warning/30";
    case "red":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function ragBar(r: Rag) {
  switch (r) {
    case "green":
      return "bg-success";
    case "amber":
      return "bg-warning";
    case "red":
      return "bg-destructive";
    default:
      return "bg-muted-foreground/40";
  }
}

export function pctOf(actual: number | null | undefined, target: number | null | undefined) {
  const a = Number(actual ?? 0);
  const t = Number(target ?? 0);
  if (!t || t <= 0) return a > 0 ? 100 : 0;
  return Math.max(0, Math.round((a / t) * 100));
}

export interface KpiRow {
  revenue_actual: number;
  revenue_target: number;
  deals_actual: number;
  deals_target: number;
  visits_actual: number;
  visits_target: number;
  calls_actual: number;
  calls_target: number;
  demos_actual: number;
  demos_target: number;
  proposals_actual: number;
  proposals_target: number;
}

export function overallScore(row: Partial<KpiRow>): number {
  let total = 0;
  let usedWeight = 0;
  for (const def of KPI_DEFS) {
    if (def.weight <= 0) continue;
    const actual = (row as any)[`${def.key}_actual`] ?? 0;
    const target = (row as any)[`${def.key}_target`] ?? 0;
    const p = pctOf(actual, target);
    total += p * def.weight;
    usedWeight += def.weight;
  }
  return usedWeight > 0 ? Math.round(total / usedWeight) : 0;
}

// Period helpers — calendar months
export function monthRange(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end, label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function pastMonths(n: number, from = new Date()) {
  const out: { start: Date; end: Date; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ref = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push(monthRange(ref));
  }
  return out;
}
