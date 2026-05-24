import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDealsStore } from "@/lib/deals/storage";
import { NextBestActionCard } from "./NextBestActionCard";
import type { NextBestAction } from "@/lib/deals/types";

type Row = { dealId: string; dealLabel: string; action: NextBestAction };

export function ActionCenterList() {
  const { deals, toggleAction, updateActionDraft } = useDealsStore();
  const [urgency, setUrgency] = useState<"all" | "today" | "this_week" | "this_month">("all");
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [actionType, setActionType] = useState<string>("all");

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    deals.forEach((d) => {
      (d.nextBestActions ?? []).forEach((a) => {
        if (urgency !== "all" && a.urgency !== urgency) return;
        if (impact !== "all" && a.estimatedImpact !== impact) return;
        if (actionType !== "all" && a.actionType !== actionType) return;
        out.push({ dealId: d.id, dealLabel: `${d.title} — ${d.clientCompany}`, action: a });
      });
    });
    return out;
  }, [deals, urgency, impact, actionType]);

  const pending = rows.filter((r) => !r.action.completed);
  const today = new Date();
  const completedToday = deals.flatMap((d) =>
    (d.nextBestActions ?? []).filter(
      (a) => a.completedAt && differenceInDays(today, new Date(a.completedAt)) === 0,
    ),
  ).length;

  const openDeals = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
  const avgHealth =
    openDeals.length > 0
      ? Math.round(openDeals.reduce((s, d) => s + (d.healthScore?.score ?? 0), 0) / openDeals.length)
      : 0;
  const staleDeals = openDeals.filter(
    (d) => differenceInDays(today, new Date(d.lastContactDate)) > 7,
  ).length;

  const sections: Array<{ label: string; urgency: NextBestAction["urgency"]; cls: string }> = [
    { label: "🔴 Due Today", urgency: "today", cls: "text-red-300" },
    { label: "🟡 This Week", urgency: "this_week", cls: "text-amber-300" },
    { label: "🟢 This Month", urgency: "this_month", cls: "text-emerald-300" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 backdrop-blur">
        <Select value={urgency} onValueChange={(v) => setUrgency(v as typeof urgency)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={impact} onValueChange={(v) => setImpact(v as typeof impact)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Impact</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="proposal">Proposal</SelectItem>
            <SelectItem value="demo">Demo</SelectItem>
            <SelectItem value="escalate">Escalate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No next-best actions yet. Open a deal and click <b>Get AI Recommendations</b> to generate.
          </p>
          <Button asChild variant="outline" className="mt-3">
            <Link to="/deals">Open Pipeline</Link>
          </Button>
        </div>
      ) : (
        sections.map((s) => {
          const list = rows.filter((r) => r.action.urgency === s.urgency);
          if (list.length === 0) return null;
          return (
            <div key={s.urgency} className="space-y-2">
              <h2 className={`text-sm font-semibold uppercase tracking-wider ${s.cls}`}>
                {s.label} ({list.length})
              </h2>
              <div className="space-y-2">
                {list.map((r) => (
                  <NextBestActionCard
                    key={r.action.id}
                    action={r.action}
                    dealLabel={r.dealLabel}
                    onToggle={() => toggleAction(r.dealId, r.action.id)}
                    onUpdateDraft={(d) => updateActionDraft(r.dealId, r.action.id, d)}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur md:grid-cols-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{pending.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Done Today</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">{completedToday}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Avg Health</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-blue-400">{avgHealth}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Stale 7d+</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-red-400">{staleDeals}</div>
        </div>
      </div>
    </div>
  );
}
