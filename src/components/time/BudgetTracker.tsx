import { Progress } from "@/components/ui/progress";
import type { TimeEntry, ProjectBudget } from "@/lib/time/types";
import type { Deal } from "@/lib/deals/types";

export function BudgetTracker({ entries, budgets, deals }: { entries: TimeEntry[]; budgets: ProjectBudget[]; deals: Deal[] }) {
  const hours = new Map<string, number>();
  for (const e of entries) if (e.dealId) hours.set(e.dealId, (hours.get(e.dealId) ?? 0) + e.duration / 60);

  const rows = budgets.map((b) => {
    const deal = deals.find((d) => d.id === b.dealId);
    const spent = hours.get(b.dealId) ?? 0;
    const pct = (spent / b.budgetedHours) * 100;
    return { b, deal, spent, pct };
  }).sort((a, b) => b.pct - a.pct);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="mb-3 text-sm font-semibold">Project budget tracker</h3>
      {rows.length === 0 && <div className="text-sm text-muted-foreground">No project budgets set.</div>}
      <div className="space-y-3">
        {rows.map(({ b, deal, spent, pct }) => {
          const tone = pct >= 100 ? "bg-red-500" : pct >= b.warningThreshold ? "bg-amber-500" : "bg-violet-500";
          const status = pct >= 100 ? "🔴 Over budget" : pct >= b.warningThreshold ? "🟡 Warning" : "🟢 On track";
          return (
            <div key={b.dealId}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium truncate">{deal?.clientCompany ?? "Unknown"} — {deal?.title ?? ""}</span>
                <span className="font-mono tabular-nums shrink-0">{spent.toFixed(1)}/{b.budgetedHours} hrs ({Math.round(pct)}%)</span>
              </div>
              <Progress value={Math.min(100, pct)} className={`h-2 [&>div]:${tone}`} />
              <div className="mt-1 text-xs text-muted-foreground">{status}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
