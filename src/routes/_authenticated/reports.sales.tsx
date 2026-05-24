import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STAGES, stageMeta, type CrmStage } from "@/lib/crm/types";
import { TrendingUp, DollarSign, Trophy, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/sales")({
  component: SalesReport,
});

type LeadRow = {
  id: string;
  stage: CrmStage;
  expected_value: number | null;
  assigned_to: string | null;
  created_at: string;
  won_at: string | null;
  lost_at: string | null;
  stage_changed_at: string | null;
};
type Profile = { id: string; full_name: string | null; email: string | null };

function SalesReport() {
  const { user, isStaff, companyId } = useAuth();
  const [days, setDays] = useState("90");
  const [from, setFrom] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const onDaysChange = (v: string) => {
    setDays(v);
    if (v !== "custom") {
      const n = parseInt(v, 10);
      setFrom(format(subDays(new Date(), n), "yyyy-MM-dd"));
      setTo(format(new Date(), "yyyy-MM-dd"));
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["reports-sales", user?.id, isStaff, companyId, from, to],
    enabled: !!user,
    queryFn: async () => {
      const fromIso = startOfDay(new Date(from)).toISOString();
      const toIso = new Date(`${to}T23:59:59`).toISOString();
      const q = supabase
        .from("crm_leads")
        .select("id,stage,expected_value,assigned_to,created_at,won_at,lost_at,stage_changed_at")
        .gte("created_at", fromIso)
        .lte("created_at", toIso);
      if (companyId) q.eq("company_id", companyId);
      if (!isStaff && user) q.eq("assigned_to", user.id);
      const { data: leads, error } = await q;
      if (error) throw error;
      const rows = (leads ?? []) as LeadRow[];

      const ids = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean))) as string[];
      let profiles = new Map<string, Profile>();
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
        profiles = new Map(((ps ?? []) as Profile[]).map((p) => [p.id, p]));
      }
      return { rows, profiles };
    },
  });

  const rows = data?.rows ?? [];
  const profiles = data?.profiles ?? new Map<string, Profile>();

  const stats = useMemo(() => {
    const byStage = new Map<CrmStage, { count: number; value: number }>();
    STAGES.forEach((s) => byStage.set(s.id, { count: 0, value: 0 }));
    rows.forEach((r) => {
      const b = byStage.get(r.stage)!;
      b.count++;
      b.value += Number(r.expected_value ?? 0);
    });
    const won = rows.filter((r) => r.stage === "won");
    const lost = rows.filter((r) => r.stage === "lost");
    const decided = won.length + lost.length;
    const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
    const wonValue = won.reduce((s, r) => s + Number(r.expected_value ?? 0), 0);
    const avgDeal = won.length ? Math.round(wonValue / won.length) : 0;

    const cycles = won
      .map((r) => (r.won_at ? (new Date(r.won_at).getTime() - new Date(r.created_at).getTime()) / 86400000 : null))
      .filter((n): n is number => n !== null && n >= 0);
    const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;

    const repMap = new Map<string, { won: number; total: number; value: number }>();
    rows.forEach((r) => {
      const k = r.assigned_to ?? "unassigned";
      const e = repMap.get(k) ?? { won: 0, total: 0, value: 0 };
      e.total++;
      if (r.stage === "won") {
        e.won++;
        e.value += Number(r.expected_value ?? 0);
      }
      repMap.set(k, e);
    });
    const reps = Array.from(repMap.entries())
      .map(([uid, v]) => ({
        userId: uid,
        name: profiles.get(uid)?.full_name ?? profiles.get(uid)?.email ?? "Unassigned",
        ...v,
        winRate: v.total ? Math.round((v.won / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return { byStage, winRate, wonValue, avgDeal, avgCycle, reps };
  }, [rows, profiles]);

  const bdt = (n: number) => `৳ ${n.toLocaleString()}`;
  const maxStage = Math.max(1, ...Array.from(stats.byStage.values()).map((v) => v.count));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Range</Label>
            <Select value={days} onValueChange={onDaysChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 6 months</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDays("custom"); }} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setDays("custom"); }} />
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} leads in window`}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Win rate" value={`${stats.winRate}%`} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Won value" value={bdt(stats.wonValue)} />
        <Kpi icon={<Trophy className="h-4 w-4" />} label="Avg deal size" value={bdt(stats.avgDeal)} />
        <Kpi icon={<Clock className="h-4 w-4" />} label="Avg sales cycle" value={`${stats.avgCycle} d`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline funnel</CardTitle>
          <CardDescription>Leads created in window, grouped by current stage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {STAGES.map((s) => {
            const v = stats.byStage.get(s.id)!;
            const meta = stageMeta(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-32 text-xs font-medium">{meta.label}</div>
                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                  <div className={`h-full ${meta.color}`} style={{ width: `${(v.count / maxStage) * 100}%` }} />
                </div>
                <div className="w-16 text-right text-xs tabular-nums">{v.count}</div>
                <div className="w-28 text-right text-xs text-muted-foreground tabular-nums">{bdt(v.value)}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales rep leaderboard</CardTitle>
          <CardDescription>Closed-won performance per assigned rep.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.reps.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No leads in selected range.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Win rate</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.reps.map((r, i) => (
                  <TableRow key={r.userId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                    <TableCell className="text-right"><Badge variant="secondary">{r.winRate}%</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{bdt(r.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
