import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { differenceInDays, isToday } from "date-fns";
import {
  TrendingUp,
  Clock,
  CheckSquare,
  FileText,
  ArrowRight,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import { useDealsStore } from "@/lib/deals/storage";
import { useTimeStore } from "@/lib/time/storage";
import { useProposalsStore } from "@/lib/proposals/storage";
import { useNotifications } from "@/lib/app/notifications";
import { DailyBriefingCard } from "@/components/time/DailyBriefingCard";
import { useSettings } from "@/lib/app/settings";

export const Route = createFileRoute("/_authenticated/command")({
  component: CommandCenter,
});

function CommandCenter() {
  const { deals } = useDealsStore();
  const { entries } = useTimeStore();
  const { proposals } = useProposalsStore();
  const { items: notifications } = useNotifications();
  const { settings } = useSettings();

  const stats = useMemo(() => {
    const open = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
    const pipelineValue = open.reduce((s, d) => s + (d.dealValue ?? 0), 0);
    const minutesToday = entries
      .filter((e) => isToday(new Date(e.startTime)))
      .reduce((s, e) => s + e.duration, 0);
    const billableMinutesToday = entries
      .filter((e) => isToday(new Date(e.startTime)) && e.billable)
      .reduce((s, e) => s + e.duration, 0);
    const todayActions = deals.flatMap((d) =>
      (d.nextBestActions ?? []).filter((a) => !a.completed && a.urgency === "today"),
    );
    const openProposals = proposals.filter((p) => p.status === "draft" || p.status === "ready" || p.status === "sent");
    const staleDeals = open.filter((d) => differenceInDays(new Date(), new Date(d.lastContactDate)) > 7);
    const wonThisMonth = deals.filter(
      (d) =>
        d.stage === "Closed Won" &&
        new Date(d.lastContactDate).getMonth() === new Date().getMonth(),
    );
    return {
      pipelineValue,
      hoursToday: minutesToday / 60,
      billableToday: billableMinutesToday / 60,
      todayActions,
      openProposals,
      staleDeals,
      wonThisMonth,
    };
  }, [deals, entries, proposals]);

  const fmt = (n: number) =>
    settings.company.currency === "BDT"
      ? `৳ ${(n / 100000).toFixed(1)}L`
      : `$ ${(n / 1000).toFixed(1)}k`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Your unified DeskIQ — meetings, deals, time, and proposals at a glance.
        </p>
      </header>

      <DailyBriefingCard entries={entries} deals={deals} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Widget
          icon={CheckSquare}
          color="text-blue-300"
          label="Actions due today"
          value={stats.todayActions.length}
          sub={stats.todayActions.slice(0, 2).map((a) => a.action).join(" · ") || "All clear"}
          to="/deals/actions"
        />
        <Widget
          icon={Clock}
          color="text-violet-300"
          label="Hours logged today"
          value={stats.hoursToday.toFixed(1)}
          sub={`${stats.billableToday.toFixed(1)}h billable · target ${settings.workingHours.billableTargetHours}h`}
          to="/time"
        />
        <Widget
          icon={TrendingUp}
          color="text-emerald-300"
          label="Pipeline value"
          value={fmt(stats.pipelineValue)}
          sub={`${stats.staleDeals.length} stale · ${stats.wonThisMonth.length} won this month`}
          to="/deals"
        />
        <Widget
          icon={FileText}
          color="text-emerald-300"
          label="Open proposals"
          value={stats.openProposals.length}
          sub={stats.openProposals.slice(0, 2).map((p) => p.clientCompany).join(" · ") || "None in flight"}
          to="/proposals"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Needs attention
          </h3>
          <div className="space-y-2">
            {stats.staleDeals.slice(0, 5).map((d) => (
              <Link
                key={d.id}
                to="/deals/$dealId"
                params={{ dealId: d.id }}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 p-3 hover:bg-accent/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.clientCompany}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.title} · last contact {differenceInDays(new Date(), new Date(d.lastContactDate))}d ago
                  </div>
                </div>
                <span className="font-mono text-xs text-red-300">{d.healthScore?.score ?? 0}</span>
              </Link>
            ))}
            {stats.staleDeals.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing stalling — keep it up.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-emerald-400" /> Recent activity
          </h3>
          <div className="space-y-2">
            {notifications.slice(0, 6).map((n) => (
              <div key={n.id} className="rounded-md border border-border/40 bg-background/30 p-2">
                <div className="text-xs font-medium">{n.title}</div>
                <div className="text-[11px] text-muted-foreground">{n.description}</div>
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Widget({
  icon: Icon,
  color,
  label,
  value,
  sub,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string | number;
  sub: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-lg border border-border/60 bg-gradient-to-br from-card/60 to-card/20 p-4 backdrop-blur transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${color}`} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground/80">{sub}</div>
    </Link>
  );
}
