import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ScoreGauge } from "@/components/scorecard/ScoreGauge";
import { KpiCard } from "@/components/scorecard/KpiCard";
import {
  KPI_DEFS, type KpiKey, isoDate, monthRange, overallScore, pastMonths, pctOf, ragBar, ragOf,
} from "@/lib/scorecard/scoring";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatBDT, initialsOf } from "@/lib/manager/helpers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Printer, Save, TrendingUp, Banknote, Briefcase, MapPin, Phone, Presentation, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scorecard/me")({
  component: MyScorecard,
});

// Map KPI -> target_metric enum value
const METRIC_BY_KPI: Record<KpiKey, string> = {
  revenue: "revenue",
  deals: "won_leads",
  visits: "visits",
  calls: "calls",
  demos: "demos",
  proposals: "proposals",
};

const ICONS: Record<KpiKey, React.ReactNode> = {
  revenue: <Banknote className="h-4 w-4" />,
  deals: <Briefcase className="h-4 w-4" />,
  visits: <MapPin className="h-4 w-4" />,
  calls: <Phone className="h-4 w-4" />,
  demos: <Presentation className="h-4 w-4" />,
  proposals: <FileText className="h-4 w-4" />,
};

async function loadActuals(userId: string, companyId: string, start: Date, end: Date) {
  const { data, error } = await supabase.rpc("compute_performance_kpis", {
    _user: userId,
    _company: companyId,
    _start: isoDate(start),
    _end: isoDate(end),
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as any;
  return {
    revenue_actual: Number(row?.revenue_actual ?? 0),
    deals_actual: Number(row?.deals_actual ?? 0),
    visits_actual: Number(row?.visits_actual ?? 0),
    calls_actual: Number(row?.calls_actual ?? 0),
    demos_actual: Number(row?.demos_actual ?? 0),
    proposals_actual: Number(row?.proposals_actual ?? 0),
  };
}

async function loadTargets(userId: string, companyId: string, start: Date, end: Date) {
  const { data, error } = await supabase
    .from("targets")
    .select("metric, target_value")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .lte("period_start", isoDate(end))
    .gte("period_end", isoDate(start));
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[(r as any).metric] = Number((r as any).target_value ?? 0);
  return {
    revenue_target: out.revenue ?? 0,
    deals_target: out.won_leads ?? 0,
    visits_target: out.visits ?? 0,
    calls_target: out.calls ?? 0,
    demos_target: out.demos ?? 0,
    proposals_target: out.proposals ?? 0,
  };
}

function MyScorecard() {
  const { user, companyId, company } = useAuth();
  const [metric, setMetric] = useState<"revenue" | "visits">("revenue");

  const period = useMemo(() => monthRange(), []);

  const profileQ = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name,email,avatar_url").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const currentQ = useQuery({
    queryKey: ["scorecard-me", user?.id, companyId, period.label],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const [actuals, targets] = await Promise.all([
        loadActuals(user!.id, companyId!, period.start, period.end),
        loadTargets(user!.id, companyId!, period.start, period.end),
      ]);
      return { ...actuals, ...targets };
    },
  });

  const trendQ = useQuery({
    queryKey: ["scorecard-trend", user?.id, companyId],
    enabled: !!user?.id && !!companyId,
    queryFn: async () => {
      const months = pastMonths(6);
      const rows = await Promise.all(
        months.map(async (m) => {
          const a = await loadActuals(user!.id, companyId!, m.start, m.end);
          return {
            month: m.start.toLocaleDateString("en-GB", { month: "short" }),
            Revenue: a.revenue_actual,
            Visits: a.visits_actual,
          };
        }),
      );
      return rows;
    },
  });

  const peerQ = useQuery({
    queryKey: ["scorecard-peers", companyId, period.label],
    enabled: !!companyId,
    queryFn: async () => {
      // get team members and their revenue actuals for the period
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (!ids.length) return { mine: 0, avg: 0, top: 0 };

      const results = await Promise.all(
        ids.map((uid: string) => loadActuals(uid, companyId!, period.start, period.end).then(a => a.revenue_actual)),
      );
      const mineIdx = ids.indexOf(user!.id);
      const mine = mineIdx >= 0 ? results[mineIdx] : 0;
      const top = Math.max(0, ...results);
      const avg = results.length ? results.reduce((a, b) => a + b, 0) / results.length : 0;
      return { mine, avg, top };
    },
  });

  async function saveSnapshot() {
    if (!user?.id || !companyId || !currentQ.data) return;
    const row = currentQ.data;
    const score = overallScore(row);
    const { error } = await supabase.from("performance_snapshots").upsert(
      {
        company_id: companyId,
        user_id: user.id,
        period_start: isoDate(period.start),
        period_end: isoDate(period.end),
        period_label: period.label,
        currency: "BDT",
        ...row,
        overall_score: score,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "company_id,user_id,period_start,period_end" },
    );
    if (error) toast.error(error.message);
    else toast.success("Snapshot saved");
  }

  const loading = currentQ.isLoading || profileQ.isLoading;
  const data = currentQ.data;
  const score = data ? overallScore(data) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 print:max-w-none print:p-0">
      <Card className="p-5 print:shadow-none">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profileQ.data?.avatar_url ?? undefined} />
            <AvatarFallback>{initialsOf(profileQ.data?.full_name ?? user?.email)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold">{profileQ.data?.full_name ?? user?.email}</div>
            <div className="text-sm text-muted-foreground">
              {company?.name ?? "—"} · {period.label}
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" /> Print / PDF
            </Button>
            <Button size="sm" onClick={saveSnapshot} disabled={!data}>
              <Save className="mr-1.5 h-4 w-4" /> Save Snapshot
            </Button>
          </div>
        </div>
        <div className="mt-6 flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-around">
          <ScoreGauge score={score} />
          <div className="grid w-full grid-cols-2 gap-2 text-sm md:max-w-md">
            {KPI_DEFS.filter(d => d.weight > 0).map((d) => {
              const a = (data as any)?.[`${d.key}_actual`] ?? 0;
              const t = (data as any)?.[`${d.key}_target`] ?? 0;
              const p = pctOf(a, t);
              return (
                <div key={d.key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-semibold tabular-nums">{p}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">KPIs</h2>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {KPI_DEFS.map((d) => (
              <KpiCard
                key={d.key}
                label={d.label}
                actual={(data as any)?.[`${d.key}_actual`] ?? 0}
                target={(data as any)?.[`${d.key}_target`] ?? 0}
                currency={d.currency}
                icon={ICONS[d.key]}
              />
            ))}
          </div>
        )}
      </section>

      <Card className="p-5 print:break-inside-avoid">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4" /> 6-Month Trend</h2>
          <div className="inline-flex rounded-md border border-border p-0.5 print:hidden">
            {(["revenue", "visits"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-sm capitalize",
                  metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendQ.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => metric === "revenue" ? formatBDT(v) : String(v)} />
              <Tooltip formatter={(v: number) => metric === "revenue" ? formatBDT(v) : v}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Line
                type="monotone"
                dataKey={metric === "revenue" ? "Revenue" : "Visits"}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 print:break-inside-avoid">
        <h2 className="mb-3 text-base font-semibold">Peer Comparison · Revenue</h2>
        {peerQ.isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <PeerBar mine={peerQ.data?.mine ?? 0} avg={peerQ.data?.avg ?? 0} top={peerQ.data?.top ?? 0} />
        )}
        <div className="mt-2 text-xs text-muted-foreground">Anonymous comparison for current month.</div>
      </Card>
    </div>
  );
}

function PeerBar({ mine, avg, top }: { mine: number; avg: number; top: number }) {
  const max = Math.max(mine, avg, top, 1);
  const rows = [
    { label: "You", value: mine, color: "bg-primary" },
    { label: "Team Avg", value: avg, color: "bg-muted-foreground/60" },
    { label: "Top Performer", value: top, color: "bg-success" },
  ];
  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatBDT(r.value)}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", r.color)} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
