import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatBDT } from "@/lib/crm/types";
import { startOfMonth, endOfMonth, subMonths, format, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Trophy, Target as TargetIcon, MapPin, Phone, FileText, CheckCircle2, XCircle } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/targets/kpis")({
  component: KpisPage,
});

type Ring = {
  label: string;
  achieved: number;
  target: number;
  color: string;
  format: (v: number) => string;
  icon: React.ComponentType<{ className?: string }>;
};

function ProgressRing({ ring }: { ring: Ring }) {
  const pct = ring.target > 0 ? Math.min(100, Math.round((ring.achieved / ring.target) * 100)) : 0;
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const Icon = ring.icon;
  return (
    <Card className="flex flex-col items-center gap-3 p-5">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/40" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            className={ring.color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className={`h-5 w-5 ${ring.color}`} />
          <div className="text-xl font-bold leading-none">{pct}%</div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold">{ring.label}</div>
        <div className="text-xs text-muted-foreground">
          {ring.format(ring.achieved)} / {ring.format(ring.target)}
        </div>
      </div>
    </Card>
  );
}

function KpisPage() {
  const { user, companyId } = useAuth();
  const userId = user?.id ?? null;
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const periodKey = monthStart.toISOString().slice(0, 10);

  // crm_targets row for this user/month
  const target = useQuery({
    queryKey: ["crm-target", userId, periodKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_targets")
        .select("revenue_target, deals_target, visits_target, currency")
        .eq("user_id", userId)
        .eq("period_month", periodKey)
        .maybeSingle();
      return (data ?? { revenue_target: 0, deals_target: 0, visits_target: 0, currency: "BDT" }) as {
        revenue_target: number; deals_target: number; visits_target: number; currency: string;
      };
    },
  });

  // Won deals this month
  const won = useQuery({
    queryKey: ["my-won", userId, periodKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_leads")
        .select("expected_value, won_at")
        .eq("assigned_to", userId)
        .eq("stage", "won")
        .gte("won_at", monthStart.toISOString())
        .lte("won_at", monthEnd.toISOString());
      return (data ?? []) as { expected_value: number | null }[];
    },
  });

  // Lost this month
  const lost = useQuery({
    queryKey: ["my-lost", userId, periodKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_leads")
        .select("id")
        .eq("assigned_to", userId)
        .eq("stage", "lost")
        .gte("lost_at", monthStart.toISOString())
        .lte("lost_at", monthEnd.toISOString());
      return (data ?? []).length;
    },
  });

  // 6-month revenue trend
  const trend = useQuery({
    queryKey: ["my-trend", userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = startOfMonth(subMonths(today, 5));
      const { data } = await sb
        .from("crm_leads")
        .select("expected_value, won_at")
        .eq("assigned_to", userId)
        .eq("stage", "won")
        .gte("won_at", start.toISOString());
      const buckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const m = startOfMonth(subMonths(today, i));
        buckets[format(m, "yyyy-MM")] = 0;
      }
      for (const r of (data ?? []) as { expected_value: number | null; won_at: string }[]) {
        const k = format(parseISO(r.won_at), "yyyy-MM");
        if (k in buckets) buckets[k] += Number(r.expected_value) || 0;
      }
      return Object.entries(buckets).map(([k, v]) => ({
        month: format(parseISO(k + "-01"), "MMM"),
        revenue: v,
      }));
    },
  });

  // Visits this month
  const visits = useQuery({
    queryKey: ["my-visits", userId, periodKey],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await sb
        .from("customer_visits")
        .select("id")
        .eq("user_id", userId)
        .gte("meeting_at", monthStart.toISOString())
        .lte("meeting_at", monthEnd.toISOString());
      return (data ?? []).length;
    },
  });

  // Activities this month (calls/demos/proposals)
  const activities = useQuery({
    queryKey: ["my-activities", userId, companyId, periodKey],
    enabled: !!userId && !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_lead_activities")
        .select("activity_type")
        .eq("user_id", userId)
        .gte("occurred_at", monthStart.toISOString())
        .lte("occurred_at", monthEnd.toISOString());
      const rows = (data ?? []) as { activity_type: string }[];
      const counts = { call: 0, demo: 0, proposal: 0, total: rows.length };
      for (const r of rows) {
        if (r.activity_type === "call") counts.call++;
        else if (r.activity_type === "demo") counts.demo++;
        else if (r.activity_type === "quote" || r.activity_type === "proposal") counts.proposal++;
      }
      return counts;
    },
  });

  const revenueAchieved = useMemo(
    () => (won.data ?? []).reduce((s, r) => s + (Number(r.expected_value) || 0), 0),
    [won.data],
  );
  const dealsWon = won.data?.length ?? 0;
  const dealsLost = lost.data ?? 0;
  const visitsDone = visits.data ?? 0;

  const rings: Ring[] = [
    {
      label: "Revenue Target",
      achieved: revenueAchieved,
      target: Number(target.data?.revenue_target ?? 0),
      color: "text-emerald-500",
      format: (v) => formatBDT(v),
      icon: Trophy,
    },
    {
      label: "Deals Target",
      achieved: dealsWon,
      target: Number(target.data?.deals_target ?? 0),
      color: "text-blue-500",
      format: (v) => `${v}`,
      icon: TargetIcon,
    },
    {
      label: "Visits Target",
      achieved: visitsDone,
      target: Number(target.data?.visits_target ?? 0),
      color: "text-amber-500",
      format: (v) => `${v}`,
      icon: MapPin,
    },
  ];

  const scoreRows = [
    { label: "Visits", icon: MapPin, value: visitsDone, target: target.data?.visits_target ?? 0 },
    { label: "Calls", icon: Phone, value: activities.data?.call ?? 0, target: 0 },
    { label: "Demos", icon: TargetIcon, value: activities.data?.demo ?? 0, target: 0 },
    { label: "Proposals", icon: FileText, value: activities.data?.proposal ?? 0, target: 0 },
    { label: "Deals Won", icon: CheckCircle2, value: dealsWon, target: target.data?.deals_target ?? 0 },
    { label: "Deals Lost", icon: XCircle, value: dealsLost, target: 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">My KPIs · {format(today, "MMMM yyyy")}</h2>
        <p className="text-sm text-muted-foreground">
          Personal progress against your monthly revenue, deals, and visits targets.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {rings.map((r) => <ProgressRing key={r.label} ring={r} />)}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Revenue trend — last 6 months</h3>
          <span className="text-xs text-muted-foreground">Closed-won revenue per month</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend.data ?? []}>
              <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs" />
              <YAxis tickFormatter={(v) => formatBDT(v)} tickLine={false} axisLine={false} className="text-xs" width={70} />
              <Tooltip
                formatter={(v: number) => formatBDT(v)}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                {(trend.data ?? []).map((_, i) => (
                  <Cell key={i} fill="hsl(var(--primary))" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Scorecard</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Metric</th>
                <th className="py-2 pr-4">Done</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {scoreRows.map((r) => {
                const Icon = r.icon;
                const pct = r.target > 0 ? Math.min(100, (r.value / Number(r.target)) * 100) : 0;
                return (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {r.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-semibold">{r.value}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{r.target || "—"}</td>
                    <td className="py-2.5">
                      {r.target > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {target.data && Number(target.data.revenue_target) === 0 && Number(target.data.deals_target) === 0 && (
        <p className="text-xs text-muted-foreground">
          No monthly target set yet for {format(today, "MMMM yyyy")}. Ask your manager to add one in the Active tab.
        </p>
      )}
    </div>
  );
}
