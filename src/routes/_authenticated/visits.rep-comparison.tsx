import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldAlert, Trophy } from "lucide-react";
import { format, subDays, subMonths, startOfMonth } from "date-fns";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/visits/rep-comparison")({
  component: RepComparisonPage,
});

type RepStat = {
  rep_id: string;
  rep_name: string;
  total_visits: number;
  unique_accounts: number;
  visits_per_account: number;
  avg_duration_min: number | null;
  pct_positive: number | null;
  territory_spread: number;
  strategic_covered: number;
  strategic_assigned: number;
  recency_score: number;
  health_score: number;
};

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function RepComparisonPage() {
  const { companyId, isStaff } = useAuth();
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90 | 180>(30);
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set());

  // Configurable health-score weights
  const [w, setW] = useState({ recency: 35, frequency: 25, tier: 25, spread: 15 });

  const since = useMemo(() => subDays(new Date(), periodDays), [periodDays]);
  const sixMonthsAgo = useMemo(() => startOfMonth(subMonths(new Date(), 5)), []);

  const { data: dataset } = useQuery({
    queryKey: ["rep-comp", companyId, periodDays],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const [accountsRes, checkinsRes, meetingsRes, trendCheckinsRes, trendMeetingsRes, profilesRes] = await Promise.all([
        supabase.from("customers")
          .select("id, customer_name, tier, region, assigned_rep_id")
          .eq("company_id", companyId!).is("deleted_at", null),
        supabase.from("visit_checkins")
          .select("user_id, account_id, checkin_time, checkout_time")
          .eq("company_id", companyId!).gte("checkin_time", since.toISOString()),
        supabase.from("customer_visits")
          .select("user_id, account_id, meeting_at, ai_sentiment")
          .eq("company_id", companyId!).gte("meeting_at", since.toISOString()),
        supabase.from("visit_checkins")
          .select("user_id, checkin_time")
          .eq("company_id", companyId!).gte("checkin_time", sixMonthsAgo.toISOString()),
        supabase.from("customer_visits")
          .select("user_id, meeting_at")
          .eq("company_id", companyId!).gte("meeting_at", sixMonthsAgo.toISOString()),
        supabase.from("profiles").select("id, full_name"),
      ]);
      return {
        accounts: (accountsRes.data ?? []) as any[],
        checkins: (checkinsRes.data ?? []) as any[],
        meetings: (meetingsRes.data ?? []) as any[],
        trendCheckins: (trendCheckinsRes.data ?? []) as any[],
        trendMeetings: (trendMeetingsRes.data ?? []) as any[],
        profiles: new Map<string, string>((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? "Unnamed"])),
      };
    },
  });

  const stats: RepStat[] = useMemo(() => {
    if (!dataset) return [];
    const { accounts, checkins, meetings, profiles } = dataset;
    const accMap = new Map<string, any>(accounts.map((a) => [a.id, a]));

    // assigned strategic counts per rep
    const assignedStrategic = new Map<string, number>();
    accounts.forEach((a) => {
      if (a.tier === "strategic" && a.assigned_rep_id) {
        assignedStrategic.set(a.assigned_rep_id, (assignedStrategic.get(a.assigned_rep_id) ?? 0) + 1);
      }
    });

    const reps = new Map<string, {
      visits: number;
      accSet: Set<string>;
      durations: number[];
      sentiments: { pos: number; total: number };
      regions: Set<string>;
      strategicCovered: Set<string>;
      lastVisit: Date | null;
    }>();
    const get = (uid: string) => {
      let r = reps.get(uid);
      if (!r) { r = { visits: 0, accSet: new Set(), durations: [], sentiments: { pos: 0, total: 0 }, regions: new Set(), strategicCovered: new Set(), lastVisit: null }; reps.set(uid, r); }
      return r;
    };

    checkins.forEach((c) => {
      if (!c.user_id) return;
      const r = get(c.user_id);
      r.visits++;
      if (c.account_id) {
        r.accSet.add(c.account_id);
        const acc = accMap.get(c.account_id);
        if (acc) {
          if (acc.region) r.regions.add(acc.region);
          if (acc.tier === "strategic") r.strategicCovered.add(c.account_id);
        }
      }
      if (c.checkin_time && c.checkout_time) {
        const mins = (new Date(c.checkout_time).getTime() - new Date(c.checkin_time).getTime()) / 60000;
        if (mins > 0 && mins < 720) r.durations.push(mins);
      }
      const d = c.checkin_time ? new Date(c.checkin_time) : null;
      if (d && (!r.lastVisit || d > r.lastVisit)) r.lastVisit = d;
    });
    meetings.forEach((m) => {
      if (!m.user_id) return;
      const r = get(m.user_id);
      r.visits++;
      if (m.account_id) {
        r.accSet.add(m.account_id);
        const acc = accMap.get(m.account_id);
        if (acc) {
          if (acc.region) r.regions.add(acc.region);
          if (acc.tier === "strategic") r.strategicCovered.add(m.account_id);
        }
      }
      if (m.ai_sentiment) {
        r.sentiments.total++;
        if (m.ai_sentiment === "positive") r.sentiments.pos++;
      }
      const d = m.meeting_at ? new Date(m.meeting_at) : null;
      if (d && (!r.lastVisit || d > r.lastVisit)) r.lastVisit = d;
    });

    // Normalize for scoring
    const arr: RepStat[] = [];
    reps.forEach((r, uid) => {
      const unique = r.accSet.size;
      const vpa = unique > 0 ? r.visits / unique : 0;
      const avgDur = r.durations.length ? r.durations.reduce((s, x) => s + x, 0) / r.durations.length : null;
      const pctPos = r.sentiments.total > 0 ? (r.sentiments.pos / r.sentiments.total) * 100 : null;
      const stratAssigned = assignedStrategic.get(uid) ?? 0;
      const stratCovered = [...r.strategicCovered].filter((aid) => {
        const a = accMap.get(aid);
        return a?.assigned_rep_id === uid;
      }).length;

      // sub-scores 0-100
      const daysSince = r.lastVisit ? Math.floor((Date.now() - r.lastVisit.getTime()) / 86400000) : periodDays;
      const recency = Math.max(0, 100 - daysSince * 3);
      const frequency = Math.min(100, vpa * 20);
      const tierCov = stratAssigned > 0 ? (stratCovered / stratAssigned) * 100 : (r.strategicCovered.size > 0 ? 70 : 40);
      const spread = Math.min(100, r.regions.size * 25);
      const total = w.recency + w.frequency + w.tier + w.spread;
      const health = total > 0
        ? Math.round((recency * w.recency + frequency * w.frequency + tierCov * w.tier + spread * w.spread) / total)
        : 0;

      arr.push({
        rep_id: uid,
        rep_name: profiles.get(uid) ?? "Unnamed",
        total_visits: r.visits,
        unique_accounts: unique,
        visits_per_account: +vpa.toFixed(2),
        avg_duration_min: avgDur !== null ? Math.round(avgDur) : null,
        pct_positive: pctPos !== null ? Math.round(pctPos) : null,
        territory_spread: r.regions.size,
        strategic_covered: stratCovered,
        strategic_assigned: stratAssigned,
        recency_score: Math.round(recency),
        health_score: health,
      });
    });
    return arr.sort((a, b) => b.health_score - a.health_score);
  }, [dataset, periodDays, w]);

  const trendData = useMemo(() => {
    if (!dataset) return [] as any[];
    const months: { key: string; label: string; start: number; end: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      const end = startOfMonth(subMonths(new Date(), i - 1));
      months.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), start: d.getTime(), end: end.getTime() });
    }
    const repIds = selectedReps.size > 0 ? [...selectedReps] : stats.slice(0, 5).map((s) => s.rep_id);
    const repCounts = new Map<string, Map<string, number>>();
    repIds.forEach((rid) => repCounts.set(rid, new Map(months.map((m) => [m.key, 0]))));
    const tally = (uid: string, t: number) => {
      if (!repCounts.has(uid)) return;
      const month = months.find((m) => t >= m.start && t < m.end);
      if (!month) return;
      const m = repCounts.get(uid)!;
      m.set(month.key, (m.get(month.key) ?? 0) + 1);
    };
    dataset.trendCheckins.forEach((c) => c.user_id && c.checkin_time && tally(c.user_id, new Date(c.checkin_time).getTime()));
    dataset.trendMeetings.forEach((c) => c.user_id && c.meeting_at && tally(c.user_id, new Date(c.meeting_at).getTime()));
    return months.map((m) => {
      const row: any = { month: m.label };
      repIds.forEach((rid) => {
        const name = dataset.profiles.get(rid) ?? "Rep";
        row[name] = repCounts.get(rid)?.get(m.key) ?? 0;
      });
      return row;
    });
  }, [dataset, stats, selectedReps]);

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required.</p>
      </Card>
    );
  }

  const compareReps = stats.filter((s) => selectedReps.has(s.rep_id));
  const trendKeys = (selectedReps.size > 0 ? compareReps : stats.slice(0, 5)).map((s) => s.rep_name);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rep Performance & Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Coverage health score combines recency, frequency, strategic-tier coverage, and territory spread.
          </p>
        </div>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as any)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">Leaderboard</h2>
          <span className="text-xs text-muted-foreground">Tick rows to compare and drive the chart below.</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">Visits/Acct</TableHead>
                <TableHead className="text-right">Avg Dur (min)</TableHead>
                <TableHead className="text-right">% Positive</TableHead>
                <TableHead className="text-right">Regions</TableHead>
                <TableHead className="text-right">Strategic</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((s) => (
                <TableRow key={s.rep_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedReps.has(s.rep_id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedReps);
                        if (v) next.add(s.rep_id); else next.delete(s.rep_id);
                        setSelectedReps(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{s.rep_name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={s.health_score >= 70 ? "default" : s.health_score >= 40 ? "secondary" : "destructive"}>
                      {s.health_score}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{s.total_visits}</TableCell>
                  <TableCell className="text-right">{s.unique_accounts}</TableCell>
                  <TableCell className="text-right">{s.visits_per_account}</TableCell>
                  <TableCell className="text-right">{s.avg_duration_min ?? "—"}</TableCell>
                  <TableCell className="text-right">{s.pct_positive !== null ? `${s.pct_positive}%` : "—"}</TableCell>
                  <TableCell className="text-right">{s.territory_spread}</TableCell>
                  <TableCell className="text-right">{s.strategic_covered}/{s.strategic_assigned}</TableCell>
                </TableRow>
              ))}
              {stats.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">No visit activity in this period.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Visit volume — last 6 months</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {selectedReps.size > 0 ? `Showing ${selectedReps.size} selected rep(s).` : "Showing top 5 reps by health score. Tick rows above to focus."}
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {trendKeys.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Health score weights</h2>
          <p className="mb-3 text-xs text-muted-foreground">Adjust to recompute scores. Defaults emphasise recency.</p>
          {(["recency", "frequency", "tier", "spread"] as const).map((k) => (
            <label key={k} className="mb-2 block">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize">{k}</span>
                <span className="font-mono text-muted-foreground">{w[k]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={w[k]}
                onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          ))}
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setW({ recency: 35, frequency: 25, tier: 25, spread: 15 })}>
            Reset defaults
          </Button>
        </Card>
      </div>

      {compareReps.length >= 2 && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Side-by-side comparison</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  {compareReps.map((r) => <TableHead key={r.rep_id} className="text-right">{r.rep_name}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "Health score", get: (r: RepStat) => r.health_score },
                  { label: "Total visits", get: (r: RepStat) => r.total_visits },
                  { label: "Unique accounts", get: (r: RepStat) => r.unique_accounts },
                  { label: "Visits per account", get: (r: RepStat) => r.visits_per_account },
                  { label: "Avg duration (min)", get: (r: RepStat) => r.avg_duration_min ?? "—" },
                  { label: "% Positive outcomes", get: (r: RepStat) => r.pct_positive !== null ? `${r.pct_positive}%` : "—" },
                  { label: "Territory spread (regions)", get: (r: RepStat) => r.territory_spread },
                  { label: "Strategic coverage", get: (r: RepStat) => `${r.strategic_covered}/${r.strategic_assigned}` },
                ].map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {compareReps.map((r) => <TableCell key={r.rep_id} className="text-right">{row.get(r)}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
