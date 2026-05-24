import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeads } from "@/lib/crm/queries";
import { STAGES, ACTIVE_STAGES, formatMoney, type CrmStage } from "@/lib/crm/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { TrendingDown, Timer, GitBranch, Zap } from "lucide-react";
import { differenceInDays, parseISO, subDays } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/velocity")({
  component: VelocityPage,
});

type StageEvent = { lead_id: string; from_stage: CrmStage | null; to_stage: CrmStage; changed_at: string };

function VelocityPage() {
  const { companyId, ready } = useAuth();
  const [assignee, setAssignee] = useState<string>("all");
  const [windowDays, setWindowDays] = useState<string>("90");

  const since = useMemo(() => subDays(new Date(), parseInt(windowDays, 10)).toISOString(), [windowDays]);

  const leads = useQuery({
    queryKey: ["crm-leads", companyId, "vel", assignee],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({ companyId: companyId!, assignedTo: assignee === "all" ? null : assignee }),
  });

  const events = useQuery({
    queryKey: ["crm-stage-events", companyId, windowDays, assignee],
    enabled: ready && !!companyId,
    queryFn: async () => {
      let q = sb
        .from("crm_lead_activities")
        .select("lead_id, occurred_at, metadata, activity_type")
        .eq("company_id", companyId)
        .eq("activity_type", "stage_change")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        lead_id: r.lead_id,
        from_stage: r.metadata?.from ?? null,
        to_stage: r.metadata?.to as CrmStage,
        changed_at: r.occurred_at,
      })) as StageEvent[];
    },
  });

  const filteredLeads = useMemo(() => {
    const ls = leads.data || [];
    if (assignee === "all") return ls;
    return ls.filter((l) => l.assigned_to === assignee);
  }, [leads.data, assignee]);

  // Avg time in each stage (from stage_change events): for transitions out of a stage
  const stageTimings = useMemo(() => {
    const evs = events.data || [];
    const perLead = new Map<string, StageEvent[]>();
    for (const e of evs) {
      const arr = perLead.get(e.lead_id) || [];
      arr.push(e);
      perLead.set(e.lead_id, arr);
    }
    const sums: Record<string, { days: number; count: number }> = {};
    for (const arr of perLead.values()) {
      for (let i = 0; i < arr.length - 1; i++) {
        const stage = arr[i].to_stage;
        const days = differenceInDays(parseISO(arr[i + 1].changed_at), parseISO(arr[i].changed_at));
        if (days < 0) continue;
        sums[stage] = sums[stage] || { days: 0, count: 0 };
        sums[stage].days += days;
        sums[stage].count += 1;
      }
    }
    return ACTIVE_STAGES.map((s) => ({
      stage: s,
      label: STAGES.find((x) => x.id === s)?.label || s,
      avg: sums[s] ? Math.round(sums[s].days / sums[s].count) : 0,
      samples: sums[s]?.count || 0,
    }));
  }, [events.data]);

  // Conversion funnel: how many leads have ever reached each stage
  const funnel = useMemo(() => {
    const evs = events.data || [];
    const reached: Record<string, Set<string>> = {};
    for (const s of [...ACTIVE_STAGES, "won", "lost"]) reached[s] = new Set();
    for (const l of filteredLeads) reached[l.stage]?.add(l.id);
    for (const e of evs) reached[e.to_stage]?.add(e.lead_id);
    const order: CrmStage[] = ["new", "initial_contact", "pricing", "negotiation", "closure", "won"];
    const base = reached["new"].size || filteredLeads.length || 1;
    return order.map((s) => {
      const count = reached[s].size;
      return {
        stage: s,
        label: STAGES.find((x) => x.id === s)?.label || s,
        count,
        pct: Math.round((count / base) * 100),
      };
    });
  }, [events.data, filteredLeads]);

  // Win rate + average sales cycle
  const stats = useMemo(() => {
    const won = filteredLeads.filter((l) => l.stage === "won");
    const lost = filteredLeads.filter((l) => l.stage === "lost");
    const decided = won.length + lost.length;
    const winRate = decided ? Math.round((won.length / decided) * 100) : 0;
    const cycles = won
      .filter((l) => l.won_at && l.created_at)
      .map((l) => differenceInDays(parseISO(l.won_at!), parseISO(l.created_at)))
      .filter((d) => d >= 0);
    const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 0;
    const wonValue = won.reduce((s, l) => s + (l.expected_value || 0), 0);
    return { winRate, avgCycle, wonCount: won.length, lostCount: lost.length, wonValue };
  }, [filteredLeads]);

  // Bottleneck = stage with longest avg time
  const bottleneck = useMemo(() => {
    const sorted = [...stageTimings].filter((s) => s.samples > 0).sort((a, b) => b.avg - a.avg);
    return sorted[0];
  }, [stageTimings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Velocity & conversion</h2>
          <p className="text-sm text-muted-foreground">Time-in-stage, funnel conversion and sales cycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <AssigneeFilter companyId={companyId} value={assignee} onChange={setAssignee} />
          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Zap className="h-4 w-4" /> Win rate</div>
          <div className="mt-1 text-2xl font-semibold">{stats.winRate}%</div>
          <div className="text-xs text-muted-foreground">{stats.wonCount} won · {stats.lostCount} lost</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="h-4 w-4" /> Avg sales cycle</div>
          <div className="mt-1 text-2xl font-semibold">{stats.avgCycle}d</div>
          <div className="text-xs text-muted-foreground">created → won</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><GitBranch className="h-4 w-4" /> Won revenue</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(stats.wonValue)}</div>
          <div className="text-xs text-muted-foreground">in selected window</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingDown className="h-4 w-4" /> Bottleneck</div>
          <div className="mt-1 text-2xl font-semibold">{bottleneck?.label || "—"}</div>
          <div className="text-xs text-muted-foreground">{bottleneck ? `${bottleneck.avg}d avg` : "no data"}</div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Avg days per stage</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageTimings}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Conversion funnel</h3>
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.stage}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground">{f.count} · {f.pct}%</span>
                </div>
                <div className="h-6 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Stage transition samples</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {stageTimings.map((s) => (
            <div key={s.stage} className="rounded border p-3">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold">{s.avg}d</div>
              <Badge variant="secondary" className="mt-1 text-[10px]">{s.samples} samples</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
