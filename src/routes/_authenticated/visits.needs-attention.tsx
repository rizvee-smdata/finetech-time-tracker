import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, AlertTriangle, TrendingDown, UserX, Bell, CheckCircle2 } from "lucide-react";
import { differenceInDays, format, subDays } from "date-fns";
import { toast } from "sonner";
import { AIInsightsPanel } from "@/components/visit-analytics/AIInsightsPanel";

export const Route = createFileRoute("/_authenticated/visits/needs-attention")({
  component: NeedsAttentionPage,
});

const STRATEGIC_TIERS = ["strategic", "standard"] as const;

type Account = {
  id: string;
  customer_name: string;
  kind: string;
  tier: string | null;
  region: string | null;
  assigned_rep_id: string | null;
};

function NeedsAttentionPage() {
  const { companyId, isStaff } = useAuth();
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(30);
  const qc = useQueryClient();

  const since = useMemo(() => subDays(new Date(), periodDays), [periodDays]);
  const priorStart = useMemo(() => subDays(since, periodDays), [since, periodDays]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["na-accounts", companyId],
    enabled: !!companyId && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, kind, tier, region, assigned_rep_id")
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const accountIds = useMemo(() => accounts.map((a) => a.id), [accounts]);

  // last visit per account (max of check-ins and meetings)
  const { data: visitData } = useQuery({
    queryKey: ["na-visits", companyId, accountIds.length],
    enabled: !!companyId && accountIds.length > 0,
    queryFn: async () => {
      const [vcRes, cvRes] = await Promise.all([
        supabase.from("visit_checkins")
          .select("account_id, user_id, checkin_time, region:account_id")
          .eq("company_id", companyId!)
          .in("account_id", accountIds)
          .not("account_id", "is", null),
        supabase.from("customer_visits")
          .select("account_id, user_id, meeting_at, ai_sentiment, next_action, status")
          .eq("company_id", companyId!)
          .in("account_id", accountIds)
          .not("account_id", "is", null),
      ]);
      return { checkins: vcRes.data ?? [], meetings: cvRes.data ?? [] };
    },
  });

  const repIds = useMemo(() => {
    const s = new Set<string>();
    accounts.forEach((a) => a.assigned_rep_id && s.add(a.assigned_rep_id));
    (visitData?.checkins ?? []).forEach((r: any) => r.user_id && s.add(r.user_id));
    (visitData?.meetings ?? []).forEach((r: any) => r.user_id && s.add(r.user_id));
    return [...s];
  }, [accounts, visitData]);

  const { data: repNames = new Map<string, string>() } = useQuery({
    queryKey: ["na-rep-names", repIds.join(",")],
    enabled: repIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", repIds);
      const m = new Map<string, string>();
      (data ?? []).forEach((p: any) => m.set(p.id, p.full_name ?? "Unnamed"));
      return m;
    },
  });

  // Per-account: last visit, visit count current period, visit count prior period, last meeting w/ sentiment
  const accountMetrics = useMemo(() => {
    const m = new Map<string, {
      lastVisit: Date | null;
      countCurrent: number;
      countPrior: number;
      lastNegativeMeeting: { date: Date; sentiment: string | null; next_action: string | null } | null;
    }>();
    accounts.forEach((a) => m.set(a.id, { lastVisit: null, countCurrent: 0, countPrior: 0, lastNegativeMeeting: null }));

    const cutoff = since.getTime();
    const priorCutoff = priorStart.getTime();
    const consume = (accountId: string | null, when: Date) => {
      if (!accountId) return;
      const rec = m.get(accountId);
      if (!rec) return;
      if (!rec.lastVisit || when > rec.lastVisit) rec.lastVisit = when;
      const t = when.getTime();
      if (t >= cutoff) rec.countCurrent++;
      else if (t >= priorCutoff) rec.countPrior++;
    };

    (visitData?.checkins ?? []).forEach((r: any) => {
      if (r.checkin_time) consume(r.account_id, new Date(r.checkin_time));
    });
    // group meetings per account for "open negative" detection
    const lastMeetByAccount = new Map<string, { date: Date; sentiment: string | null; next_action: string | null }>();
    (visitData?.meetings ?? []).forEach((r: any) => {
      if (!r.meeting_at) return;
      const d = new Date(r.meeting_at);
      consume(r.account_id, d);
      if (r.account_id) {
        const cur = lastMeetByAccount.get(r.account_id);
        if (!cur || d > cur.date) {
          lastMeetByAccount.set(r.account_id, { date: d, sentiment: r.ai_sentiment ?? null, next_action: r.next_action ?? null });
        }
      }
    });
    lastMeetByAccount.forEach((v, k) => {
      const rec = m.get(k);
      if (rec && (v.sentiment === "negative" || (v.next_action && v.next_action.trim()))) {
        rec.lastNegativeMeeting = v;
      }
    });

    return m;
  }, [accounts, visitData, since, priorStart]);

  // Flag 1: strategic/standard accounts not visited in N+ days
  const staleStrategic = useMemo(() => {
    return accounts
      .filter((a) => a.tier && (STRATEGIC_TIERS as readonly string[]).includes(a.tier))
      .map((a) => {
        const mm = accountMetrics.get(a.id)!;
        const days = mm.lastVisit ? differenceInDays(new Date(), mm.lastVisit) : null;
        return { acc: a, lastVisit: mm.lastVisit, days };
      })
      .filter((r) => r.days === null || r.days >= periodDays)
      .sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999));
  }, [accounts, accountMetrics, periodDays]);

  // Flag 2: open negative outcomes / unresolved follow-up
  const openNegatives = useMemo(() => {
    return accounts
      .map((a) => ({ acc: a, info: accountMetrics.get(a.id)?.lastNegativeMeeting ?? null }))
      .filter((r) => r.info !== null)
      .sort((a, b) => (b.info!.date.getTime() - a.info!.date.getTime()));
  }, [accounts, accountMetrics]);

  // Flag 3: rep under-coverage — assigned accounts where rep's visits < team avg for that tier
  const repUnderCoverage = useMemo(() => {
    // average visits per assigned account per tier across all reps in current period
    const tierVisitsByRep = new Map<string, Map<string, number>>(); // tier -> rep -> total visits to their assigned accounts
    const tierAssignedAccountsByRep = new Map<string, Map<string, number>>();
    accounts.forEach((a) => {
      if (!a.tier || !a.assigned_rep_id) return;
      const t = a.tier;
      const r = a.assigned_rep_id;
      if (!tierAssignedAccountsByRep.has(t)) tierAssignedAccountsByRep.set(t, new Map());
      const am = tierAssignedAccountsByRep.get(t)!;
      am.set(r, (am.get(r) ?? 0) + 1);
      const mm = accountMetrics.get(a.id)!;
      if (!tierVisitsByRep.has(t)) tierVisitsByRep.set(t, new Map());
      const vm = tierVisitsByRep.get(t)!;
      vm.set(r, (vm.get(r) ?? 0) + mm.countCurrent);
    });
    const rows: { rep_id: string; tier: string; rate: number; teamAvg: number; assignedCount: number }[] = [];
    tierAssignedAccountsByRep.forEach((repCounts, tier) => {
      const rates: number[] = [];
      const perRep: { rep: string; rate: number; assigned: number }[] = [];
      repCounts.forEach((assigned, rep) => {
        const visits = tierVisitsByRep.get(tier)?.get(rep) ?? 0;
        const rate = visits / Math.max(1, assigned);
        rates.push(rate);
        perRep.push({ rep, rate, assigned });
      });
      const avg = rates.reduce((s, x) => s + x, 0) / Math.max(1, rates.length);
      perRep.forEach(({ rep, rate, assigned }) => {
        if (rate < avg * 0.6 && assigned >= 2) {
          rows.push({ rep_id: rep, tier, rate, teamAvg: avg, assignedCount: assigned });
        }
      });
    });
    return rows.sort((a, b) => a.rate - b.rate);
  }, [accounts, accountMetrics]);

  // Flag 4: region drop >20% vs prior period
  const regionDrops = useMemo(() => {
    const cur = new Map<string, number>();
    const prior = new Map<string, number>();
    accounts.forEach((a) => {
      const region = a.region ?? "Unassigned";
      const mm = accountMetrics.get(a.id)!;
      cur.set(region, (cur.get(region) ?? 0) + mm.countCurrent);
      prior.set(region, (prior.get(region) ?? 0) + mm.countPrior);
    });
    const out: { region: string; current: number; prior: number; deltaPct: number }[] = [];
    cur.forEach((c, region) => {
      const p = prior.get(region) ?? 0;
      if (p < 3) return; // skip tiny baselines
      const delta = ((c - p) / p) * 100;
      if (delta <= -20) out.push({ region, current: c, prior: p, deltaPct: delta });
    });
    return out.sort((a, b) => a.deltaPct - b.deltaPct);
  }, [accounts, accountMetrics]);

  const createReminder = useMutation({
    mutationFn: async (input: { user_id: string; title: string; body: string }) => {
      const { error } = await supabase.from("reminders").insert({
        user_id: input.user_id,
        company_id: companyId!,
        title: input.title,
        body: input.body,
        remind_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up reminder created");
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create reminder"),
  });

  if (!isStaff) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm">Admin or manager role required.</p>
      </Card>
    );
  }

  const totalFlags = staleStrategic.length + openNegatives.length + repUnderCoverage.length + regionDrops.length;

  const repName = (id: string | null) => (id ? (repNames.get(id) ?? "Rep") : "Unassigned");

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Needs Attention</h1>
          <p className="text-sm text-muted-foreground">
            Auto-flagged accounts and reps across coverage, outcomes, fairness, and territory trends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline">{totalFlags} total flags</Badge>
        </div>
      </header>

      <AIInsightsPanel periodDays={periodDays} />

      <Tabs defaultValue="stale" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stale" className="gap-2"><AlertTriangle className="h-4 w-4" />Stale strategic <Badge variant="secondary">{staleStrategic.length}</Badge></TabsTrigger>
          <TabsTrigger value="neg" className="gap-2"><Bell className="h-4 w-4" />Open negatives <Badge variant="secondary">{openNegatives.length}</Badge></TabsTrigger>
          <TabsTrigger value="under" className="gap-2"><UserX className="h-4 w-4" />Rep under-coverage <Badge variant="secondary">{repUnderCoverage.length}</Badge></TabsTrigger>
          <TabsTrigger value="region" className="gap-2"><TrendingDown className="h-4 w-4" />Region drops <Badge variant="secondary">{regionDrops.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="stale" className="space-y-2">
          {staleStrategic.length === 0 && <EmptyState text="All strategic/standard accounts visited recently. 🎉" />}
          {staleStrategic.map(({ acc, lastVisit, days }) => (
            <Card key={acc.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{acc.customer_name}</span>
                  <Badge variant={acc.tier === "strategic" ? "default" : "secondary"}>{acc.tier}</Badge>
                  <Badge variant="outline" className="capitalize">{acc.kind}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {days === null ? "Never visited" : `${days} days since last visit`}
                  {lastVisit && ` · ${format(lastVisit, "MMM d, yyyy")}`}
                  {" · Rep: "}{repName(acc.assigned_rep_id)}
                </div>
              </div>
              {acc.assigned_rep_id && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={createReminder.isPending}
                  onClick={() =>
                    createReminder.mutate({
                      user_id: acc.assigned_rep_id!,
                      title: `Visit overdue: ${acc.customer_name}`,
                      body: `${acc.tier} ${acc.kind} not visited in ${days ?? "ever"} days. Schedule a visit.`,
                    })
                  }
                >
                  Assign follow-up
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="neg" className="space-y-2">
          {openNegatives.length === 0 && <EmptyState text="No open negative outcomes or pending next actions." />}
          {openNegatives.map(({ acc, info }) => (
            <Card key={acc.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{acc.customer_name}</span>
                  {info!.sentiment === "negative" && <Badge variant="destructive">Negative</Badge>}
                  {info!.next_action && <Badge variant="outline">Action: {info!.next_action.slice(0, 40)}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Last meeting {format(info!.date, "MMM d, yyyy")} · Rep: {repName(acc.assigned_rep_id)}
                </div>
              </div>
              {acc.assigned_rep_id && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={createReminder.isPending}
                  onClick={() =>
                    createReminder.mutate({
                      user_id: acc.assigned_rep_id!,
                      title: `Follow up: ${acc.customer_name}`,
                      body: info!.next_action
                        ? `Pending action: ${info!.next_action}`
                        : `Last meeting outcome was negative — needs a recovery visit.`,
                    })
                  }
                >
                  Assign follow-up
                </Button>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="under" className="space-y-2">
          {repUnderCoverage.length === 0 && <EmptyState text="All reps are within team-average coverage for their tier." />}
          {repUnderCoverage.map((r, i) => (
            <Card key={i} className="flex items-center justify-between gap-3 p-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {repName(r.rep_id)}
                  <Badge variant="secondary" className="capitalize">{r.tier}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.rate.toFixed(1)} visits/account vs team avg {r.teamAvg.toFixed(1)} ({r.assignedCount} assigned)
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={createReminder.isPending}
                onClick={() =>
                  createReminder.mutate({
                    user_id: r.rep_id,
                    title: `Coverage gap on ${r.tier} accounts`,
                    body: `Your ${r.tier} accounts are receiving ${r.rate.toFixed(1)} visits each (team avg ${r.teamAvg.toFixed(1)}). Please plan additional visits.`,
                  })
                }
              >
                Notify rep
              </Button>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="region" className="space-y-2">
          {regionDrops.length === 0 && <EmptyState text="No regions have dropped more than 20% versus the prior period." />}
          {regionDrops.map((r) => (
            <Card key={r.region} className="flex items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium">{r.region}</div>
                <div className="text-xs text-muted-foreground">
                  {r.current} visits this period vs {r.prior} prior · {r.deltaPct.toFixed(0)}%
                </div>
              </div>
              <Badge variant="destructive">{r.deltaPct.toFixed(0)}%</Badge>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      {text}
    </Card>
  );
}
