import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { differenceInDays } from "date-fns";
import {
  TrendingUp,
  CheckSquare,
  FileText,
  ArrowRight,
  AlertTriangle,
  Trophy,
  Sparkles,
  Loader2,
  RefreshCw,
  Target,
  Flame,
  Brain,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDealsStore } from "@/lib/deals/storage";
import { useProposalsStore } from "@/lib/proposals/storage";
import { useNotifications } from "@/lib/app/notifications";
import { useSettings } from "@/lib/app/settings";
import { useAuth } from "@/hooks/use-auth";
import { generateBriefing } from "@/lib/ai/briefing.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/command")({
  component: CommandCenter,
});

const STAGE_COLORS: Record<string, string> = {
  Prospecting: "#60A5FA",
  Discovery: "#A78BFA",
  Proposal: "#FBBF24",
  Negotiation: "#FB923C",
  "Closed Won": "#34D399",
  "Closed Lost": "#F87171",
};

type Briefing = Awaited<ReturnType<typeof generateBriefing>>;

function CommandCenter() {
  const { deals } = useDealsStore();
  const { proposals } = useProposalsStore();
  const { items: notifications } = useNotifications();
  const { settings } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const runBriefing = useServerFn(generateBriefing);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const stats = useMemo(() => {
    const open = deals.filter((d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost");
    const closed = deals.filter((d) => d.stage === "Closed Won" || d.stage === "Closed Lost");
    const won = deals.filter((d) => d.stage === "Closed Won");
    const pipelineValue = open.reduce((s, d) => s + (d.dealValue ?? 0), 0);
    const wtdValue = won.reduce((s, d) => s + (d.dealValue ?? 0), 0);
    const todayActions = deals.flatMap((d) =>
      (d.nextBestActions ?? []).filter((a) => !a.completed && a.urgency === "today"),
    );
    const weekActions = deals.flatMap((d) =>
      (d.nextBestActions ?? []).filter((a) => !a.completed && a.urgency === "this_week"),
    );
    const openProposals = proposals.filter(
      (p) => p.status === "draft" || p.status === "ready" || p.status === "sent",
    );
    const staleDeals = open.filter(
      (d) => differenceInDays(new Date(), new Date(d.lastContactDate)) > 7,
    );
    const wonThisMonth = won.filter(
      (d) => new Date(d.lastContactDate).getMonth() === new Date().getMonth(),
    );
    const winRate = closed.length ? Math.round((won.length / closed.length) * 100) : 0;
    const stageBreakdown = Object.entries(
      open.reduce<Record<string, number>>((acc, d) => {
        acc[d.stage] = (acc[d.stage] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([stage, count]) => ({ stage, count }));
    const valueByStage = Object.entries(
      open.reduce<Record<string, number>>((acc, d) => {
        acc[d.stage] = (acc[d.stage] ?? 0) + (d.dealValue ?? 0);
        return acc;
      }, {}),
    ).map(([stage, value]) => ({ stage, value }));
    const topDeals = [...open]
      .sort((a, b) => (b.dealValue ?? 0) - (a.dealValue ?? 0))
      .slice(0, 5);
    const atRisk = open.filter(
      (d) => d.healthScore?.status === "at_risk" || d.healthScore?.status === "stalling",
    );
    return {
      pipelineValue,
      wtdValue,
      todayActions,
      weekActions,
      openProposals,
      staleDeals,
      wonThisMonth,
      winRate,
      stageBreakdown,
      valueByStage,
      topDeals,
      atRisk,
      open,
    };
  }, [deals, proposals]);

  const fmt = (n: number) => `$ ${(n / 1000).toFixed(1)}k`;

  const repName = user?.user_metadata?.name || user?.email?.split("@")[0] || "there";

  async function fetchBriefing() {
    setBriefingLoading(true);
    try {
      const payload = {
        userName: repName,
        currency: settings.company.currency,
        pipelineValue: stats.pipelineValue,
        wonThisMonthValue: stats.wonThisMonth.reduce((s, d) => s + (d.dealValue ?? 0), 0),
        proposalsOpen: stats.openProposals.length,
        todayActions: stats.todayActions.length,
        deals: stats.open.slice(0, 40).map((d) => ({
          id: d.id,
          title: d.title,
          clientCompany: d.clientCompany,
          stage: d.stage,
          dealValue: d.dealValue ?? 0,
          currency: d.currency,
          healthScore: d.healthScore?.score,
          healthStatus: d.healthScore?.status,
          daysSinceContact: differenceInDays(new Date(), new Date(d.lastContactDate)),
          probability: d.probability,
          lastNote: d.interactions?.slice(-1)[0]?.notes?.slice(0, 240),
          competitors: d.competitors ?? [],
        })),
      };
      const result = await runBriefing({ data: payload });
      setBriefing(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate briefing");
    } finally {
      setBriefingLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {repName} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Your unified command center — pipeline, priorities, and AI prep for today.
          </p>
        </div>
        <Button
          onClick={fetchBriefing}
          disabled={briefingLoading || stats.open.length === 0}
          className="gap-2"
        >
          {briefingLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : briefing ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {briefing ? "Regenerate AI Briefing" : "Generate AI Briefing"}
        </Button>
      </header>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Widget
          icon={CheckSquare}
          color="text-blue-300"
          label="Actions today"
          value={stats.todayActions.length}
          sub={`${stats.weekActions.length} more this week`}
          to="/deals/actions"
        />
        <Widget
          icon={TrendingUp}
          color="text-emerald-300"
          label="Pipeline value"
          value={fmt(stats.pipelineValue)}
          sub={`${stats.open.length} open deals`}
          to="/deals"
        />
        <Widget
          icon={Trophy}
          color="text-amber-300"
          label="Won this month"
          value={fmt(stats.wonThisMonth.reduce((s, d) => s + (d.dealValue ?? 0), 0))}
          sub={`${stats.wonThisMonth.length} closed-won`}
          to="/reports/sales"
        />
        <Widget
          icon={Target}
          color="text-purple-300"
          label="Win rate"
          value={`${stats.winRate}%`}
          sub={`${stats.atRisk.length} at risk`}
          to="/deals/insights"
        />
        <Widget
          icon={FileText}
          color="text-cyan-300"
          label="Open proposals"
          value={stats.openProposals.length}
          sub={
            stats.openProposals.slice(0, 2).map((p) => p.clientCompany).join(" · ") || "None in flight"
          }
          to="/proposals"
        />
      </div>

      {/* AI Briefing */}
      <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-card/40 to-card/20 p-5 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
            AI Sales Prep — Today's Briefing
          </h3>
        </div>

        {!briefing && !briefingLoading && (
          <p className="text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">Generate AI Briefing</span> to get a
            personalized analysis of your pipeline — focus deals, talking points, risks, and a coaching tip
            tailored to your data right now.
          </p>
        )}

        {briefingLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing {stats.open.length} deals…
          </div>
        )}

        {briefing && (
          <div className="space-y-5">
            <p className="text-base font-medium leading-snug">{briefing.headline}</p>

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-orange-400" /> Focus deals today
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                {briefing.focusDeals.map((f) => (
                  <button
                    key={f.dealId}
                    onClick={() =>
                      navigate({ to: "/deals/$dealId", params: { dealId: f.dealId } })
                    }
                    className="rounded-md border border-border/60 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-accent/30"
                  >
                    <div className="text-sm font-semibold">{f.clientCompany}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{f.why}</div>
                    <div className="mt-2 text-xs">
                      <span className="font-medium text-emerald-300">Next:</span> {f.suggestedAction}
                    </div>
                    {f.talkingPoints.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                        {f.talkingPoints.slice(0, 4).map((t, i) => (
                          <li key={i}>• {t}</li>
                        ))}
                      </ul>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Risks
                </h4>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {briefing.risks.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  <TrendingUp className="h-3.5 w-3.5" /> Opportunities
                </h4>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {briefing.opportunities.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Coaching tip
                </div>
                <div className="mt-1 text-sm">{briefing.coachingTip}</div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  For the road
                </div>
                <div className="mt-1 text-sm italic">"{briefing.moraleLine}"</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analytics charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-3 text-sm font-semibold">Pipeline by stage (count)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.stageBreakdown}
                  dataKey="count"
                  nameKey="stage"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {stats.stageBreakdown.map((s) => (
                    <Cell key={s.stage} fill={STAGE_COLORS[s.stage] ?? "#888"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {stats.stageBreakdown.map((s) => (
              <span key={s.stage} className="flex items-center gap-1">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: STAGE_COLORS[s.stage] ?? "#888" }}
                />
                {s.stage} ({s.count})
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-3 text-sm font-semibold">Value by stage</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.valueByStage}>
                <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickFormatter={(v) =>
                    settings.company.currency === "BDT"
                      ? `${(v / 100000).toFixed(0)}L`
                      : `${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0D1117", border: "1px solid #333" }}
                  formatter={(v: number) => fmt(v)}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {stats.valueByStage.map((s) => (
                    <Cell key={s.stage} fill={STAGE_COLORS[s.stage] ?? "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-emerald-400" /> Top deals by value
          </h3>
          <div className="space-y-2">
            {stats.topDeals.map((d) => (
              <Link
                key={d.id}
                to="/deals/$dealId"
                params={{ dealId: d.id }}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 p-3 hover:bg-accent/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.clientCompany}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.stage}</div>
                </div>
                <span className="font-mono text-xs text-emerald-300">{fmt(d.dealValue ?? 0)}</span>
              </Link>
            ))}
            {stats.topDeals.length === 0 && (
              <p className="text-sm text-muted-foreground">No open deals yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-4 backdrop-blur">
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
                    {d.title} ·{" "}
                    {differenceInDays(new Date(), new Date(d.lastContactDate))}d since contact
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
            <Sparkles className="h-4 w-4 text-primary" /> Recent activity
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
