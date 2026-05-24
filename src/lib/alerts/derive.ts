import type { Deal } from "@/lib/deals/types";
import type { ProjectBudget, TimeEntry, TimerState, Alert } from "@/lib/time/types";
import { computeElapsedSec } from "@/lib/time/storage";

function fmtPct(n: number) { return `${Math.round(n)}%`; }

export function deriveAlerts(
  deals: Deal[],
  entries: TimeEntry[],
  budgets: ProjectBudget[],
  timer: TimerState | null,
  now = Date.now(),
): Alert[] {
  const alerts: Alert[] = [];

  // Deal stalling
  for (const d of deals) {
    if (d.stage === "Closed Won" || d.stage === "Closed Lost") continue;
    if (d.healthScore && d.healthScore.score < 40) {
      alerts.push({
        id: `stall-${d.id}`,
        type: "deal_stalling",
        severity: "critical",
        title: `${d.clientCompany} is stalling`,
        description: `Health score ${d.healthScore.score}/100 — needs attention now.`,
        timestamp: new Date(now).toISOString(),
        link: `/deals/${d.id}`,
        actionLabel: "View deal",
      });
    }
  }

  // Follow-up overdue (urgency=today and uncompleted)
  for (const d of deals) {
    if (!d.nextBestActions) continue;
    for (const a of d.nextBestActions) {
      if (a.completed) continue;
      if (a.urgency === "today" && a.priority === 1) {
        alerts.push({
          id: `nba-${d.id}-${a.id}`,
          type: "follow_up_overdue",
          severity: "warning",
          title: `Follow-up due: ${d.clientCompany}`,
          description: a.action,
          timestamp: new Date(now).toISOString(),
          link: `/deals/${d.id}`,
          actionLabel: "Take action",
        });
      }
    }
  }

  // Budget warnings
  const hoursByDeal = new Map<string, number>();
  for (const e of entries) {
    if (!e.dealId) continue;
    hoursByDeal.set(e.dealId, (hoursByDeal.get(e.dealId) ?? 0) + e.duration / 60);
  }
  for (const b of budgets) {
    const spent = hoursByDeal.get(b.dealId) ?? 0;
    const pct = (spent / b.budgetedHours) * 100;
    if (pct >= b.warningThreshold) {
      const deal = deals.find((d) => d.id === b.dealId);
      alerts.push({
        id: `budget-${b.dealId}`,
        type: "budget_warning",
        severity: pct >= 100 ? "critical" : "warning",
        title: `${deal?.clientCompany ?? "Project"} ${fmtPct(pct)} of budget`,
        description: `${spent.toFixed(1)} / ${b.budgetedHours} hrs used.`,
        timestamp: new Date(now).toISOString(),
        link: "/time/revenue",
        actionLabel: "Review budget",
      });
    }
  }

  // Close date approaching (within 7 days, not closed)
  for (const d of deals) {
    if (d.stage === "Closed Won" || d.stage === "Closed Lost") continue;
    const days = Math.floor((new Date(d.expectedCloseDate).getTime() - now) / 86400000);
    if (days >= 0 && days <= 7) {
      alerts.push({
        id: `close-${d.id}`,
        type: "close_approaching",
        severity: "info",
        title: `${d.clientCompany} closes in ${days}d`,
        description: `Expected close: ${new Date(d.expectedCloseDate).toLocaleDateString()}.`,
        timestamp: new Date(now).toISOString(),
        link: `/deals/${d.id}`,
        actionLabel: "View deal",
      });
    }
  }

  // Idle timer > 3h
  if (timer && timer.isRunning) {
    const sec = computeElapsedSec(timer, now);
    if (sec > 3 * 3600) {
      alerts.push({
        id: "idle-timer",
        type: "idle_timer",
        severity: "warning",
        title: "Timer running 3+ hours",
        description: `"${timer.currentDescription || "Untitled"}" — did you forget to stop?`,
        timestamp: new Date(now).toISOString(),
        link: "/time",
        actionLabel: "Open timer",
      });
    }
  }

  return alerts;
}
