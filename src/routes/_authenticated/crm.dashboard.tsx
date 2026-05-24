import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeads } from "@/lib/crm/queries";
import { STAGES, ACTIVE_STAGES, formatMoney } from "@/lib/crm/types";
import { Card } from "@/components/ui/card";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { Trophy, TrendingUp, Users, Target } from "lucide-react";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/crm/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { companyId, ready } = useAuth();
  const [assignee, setAssignee] = useState<string>("all");

  const leads = useQuery({
    queryKey: ["crm-leads", companyId, "dash", assignee],
    enabled: ready && !!companyId,
    queryFn: () => fetchLeads({
      companyId: companyId!,
      assignedTo: assignee === "all" ? null : assignee,
    }),
  });

  const visitsCount = useQuery({
    queryKey: ["crm-visit-count", companyId, assignee],
    enabled: ready && !!companyId,
    queryFn: async () => {
      let q = sb.from("customer_visits").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "office_study");
      if (assignee !== "all" && assignee !== "unassigned") q = q.eq("user_id", assignee);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const all = leads.data ?? [];
  const won = all.filter((l) => l.stage === "won");
  const lost = all.filter((l) => l.stage === "lost");
  const active = all.filter((l) => ACTIVE_STAGES.includes(l.stage));
  const pipelineValue = active.reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const weightedValue = active.reduce((s, l) => s + ((l.expected_value ?? 0) * l.probability) / 100, 0);
  const wonValue = won.reduce((s, l) => s + (l.expected_value ?? 0), 0);
  const conversion = all.length ? Math.round((won.length / all.length) * 100) : 0;
  const visitConversion = (visitsCount.data ?? 0) ? Math.round((all.length / (visitsCount.data as number)) * 100) : 0;

  // Leaderboard
  const board = new Map<string, { name: string; won: number; value: number }>();
  for (const l of won) {
    const key = l.assignee?.full_name || l.assignee?.email || "Unassigned";
    const cur = board.get(key) ?? { name: key, won: 0, value: 0 };
    cur.won++; cur.value += l.expected_value ?? 0;
    board.set(key, cur);
  }
  const leaderboard = Array.from(board.values()).sort((a, b) => b.value - a.value).slice(0, 5);

  // Stage distribution
  const stageCounts = STAGES.map((s) => ({
    ...s,
    count: all.filter((l) => l.stage === s.id).length,
    value: all.filter((l) => l.stage === s.id).reduce((sum, l) => sum + (l.expected_value ?? 0), 0),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM Dashboard</h1>
          <p className="text-sm text-muted-foreground">Pipeline health and conversion metrics.</p>
        </div>
        <AssigneeFilter companyId={companyId} value={assignee} onChange={setAssignee} />
      </header>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Target} label="Active pipeline" value={formatMoney(pipelineValue)} sub={`${active.length} open leads`} />
        <Kpi icon={TrendingUp} label="Weighted forecast" value={formatMoney(weightedValue)} sub="Value × probability" />
        <Kpi icon={Trophy} label="Won this period" value={formatMoney(wonValue)} sub={`${won.length} deals · ${lost.length} lost`} />
        <Kpi icon={Users} label="Conversion" value={`${conversion}%`} sub={`${visitConversion}% from visits`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Pipeline by stage</h2>
          <div className="space-y-2">
            {stageCounts.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-[140px]">
                  <span className={`h-2 w-2 rounded-full ${s.color}`} />
                  <span>{s.label}</span>
                </div>
                <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                  <div className={s.color + " h-full"} style={{ width: `${all.length ? (s.count / all.length) * 100 : 0}%` }} />
                </div>
                <div className="w-24 text-right text-xs text-muted-foreground">{s.count} · {formatMoney(s.value)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Top closers</h2>
          {leaderboard.length === 0 && <p className="text-sm text-muted-foreground">No closed deals yet.</p>}
          <div className="space-y-2">
            {leaderboard.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <span>{r.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatMoney(r.value)}</div>
                  <div className="text-xs text-muted-foreground">{r.won} deal{r.won === 1 ? "" : "s"}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}
