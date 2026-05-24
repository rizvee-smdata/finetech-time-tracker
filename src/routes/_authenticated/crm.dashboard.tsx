import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeads } from "@/lib/crm/queries";
import { STAGES, ACTIVE_STAGES, formatMoney } from "@/lib/crm/types";
import { Card } from "@/components/ui/card";
import { AssigneeFilter } from "@/components/crm/AssigneeFilter";
import { Trophy, TrendingUp, Users, Target, AlertCircle, Clock, FileCheck } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { format, subMonths, startOfMonth, differenceInDays } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  const overdueQ = useQuery({
    queryKey: ["crm-overdue-tasks", companyId, assignee],
    enabled: ready && !!companyId,
    queryFn: async () => {
      let q = sb.from("tms_tasks")
        .select("id, title, due_date, lead_id, tms_task_assignees(user_id), tms_task_statuses(is_terminal)")
        .eq("company_id", companyId)
        .not("lead_id", "is", null)
        .is("deleted_at", null)
        .lt("due_date", new Date().toISOString().slice(0, 10));
      const { data } = await q;
      const list = (data ?? []).filter((t: any) => !t.tms_task_statuses?.is_terminal);
      if (assignee === "all") return list;
      if (assignee === "unassigned") return list.filter((t: any) => !t.tms_task_assignees?.length);
      return list.filter((t: any) => (t.tms_task_assignees ?? []).some((a: any) => a.user_id === assignee));
    },
  });

  const pendingApprovals = useQuery({
    queryKey: ["crm-pending-approvals", companyId],
    enabled: ready && !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("crm_quotes")
        .select("id, title, version, amount, currency, discount_pct, lead_id, approval_requested_at, crm_leads!inner(customer_name, company_id)")
        .eq("approval_status", "requested")
        .eq("crm_leads.company_id", companyId)
        .order("approval_requested_at", { ascending: true });
      return data ?? [];
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

  // Idle leads — open for >5 days with no activity
  const now = new Date();
  const idleLeads = active
    .map((l) => ({ ...l, idleDays: differenceInDays(now, new Date(l.last_activity_at)) }))
    .filter((l) => l.idleDays >= 5)
    .sort((a, b) => b.idleDays - a.idleDays)
    .slice(0, 8);

  // Conversion funnel
  const visitsN = visitsCount.data ?? 0;
  const negotiationPlus = all.filter((l) => ["negotiation", "closure", "won"].includes(l.stage)).length;
  const funnel = [
    { label: "Visits", count: visitsN, color: "bg-slate-400" },
    { label: "Leads", count: all.length, color: "bg-blue-500" },
    { label: "Negotiation+", count: negotiationPlus, color: "bg-amber-500" },
    { label: "Won", count: won.length, color: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);

  // 6-month trend (created vs won, by month of creation/win)
  const trend = Array.from({ length: 6 }).map((_, i) => {
    const monthStart = startOfMonth(subMonths(new Date(), 5 - i));
    const monthEnd = startOfMonth(subMonths(new Date(), 5 - i - 1));
    const created = all.filter((l) => new Date(l.created_at) >= monthStart && new Date(l.created_at) < monthEnd).length;
    const wonM = won.filter((l) => l.won_at && new Date(l.won_at) >= monthStart && new Date(l.won_at) < monthEnd).length;
    return { month: format(monthStart, "MMM"), Created: created, Won: wonM };
  });


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


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={Target} label="Active pipeline" value={formatMoney(pipelineValue)} sub={`${active.length} open leads`} />
        <Kpi icon={TrendingUp} label="Weighted forecast" value={formatMoney(weightedValue)} sub="Value × probability" />
        <Kpi icon={Trophy} label="Won this period" value={formatMoney(wonValue)} sub={`${won.length} deals · ${lost.length} lost`} />
        <Kpi icon={Users} label="Conversion" value={`${conversion}%`} sub={`${visitConversion}% from visits`} />
        <Kpi icon={AlertCircle} label="Overdue tasks" value={String((overdueQ.data ?? []).length)} sub="On open leads" />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">6-month trend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Created" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" dataKey="Won" stroke="#16a34a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Conversion funnel</h2>
          <div className="space-y-3">
            {funnel.map((f, i) => {
              const prev = i > 0 ? funnel[i - 1].count : null;
              const rate = prev ? Math.round((f.count / prev) * 100) : null;
              return (
                <div key={f.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-muted-foreground">
                      {f.count}{rate != null && <> · <span className={rate >= 50 ? "text-emerald-600" : rate >= 20 ? "text-amber-600" : "text-rose-600"}>{rate}%</span></>}
                    </span>
                  </div>
                  <div className="h-3 rounded bg-muted overflow-hidden">
                    <div className={`${f.color} h-full transition-all`} style={{ width: `${(f.count / funnelMax) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><FileCheck className="h-4 w-4" />Pending approvals</h2>
            <Badge variant="secondary">{(pendingApprovals.data ?? []).length}</Badge>
          </div>
          {(pendingApprovals.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes awaiting approval.</p>
          ) : (
            <div className="space-y-2">
              {(pendingApprovals.data ?? []).slice(0, 6).map((q: any) => (
                <Link key={q.id} to="/crm/$leadId" params={{ leadId: q.lead_id }} className="block">
                  <div className="rounded border p-2 text-sm hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{q.crm_leads?.customer_name} · v{q.version}</span>
                      <Badge variant="outline">{q.discount_pct}% off</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatMoney(q.amount, q.currency)} · {q.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" />Idle leads (5+ days no activity)</h2>
          <Badge variant="secondary">{idleLeads.length}</Badge>
        </div>
        {idleLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">All active leads have recent activity. </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {idleLeads.map((l) => (
              <Link key={l.id} to="/crm/$leadId" params={{ leadId: l.id }} className="block">
                <div className="rounded border p-2 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{l.customer_name}</span>
                    <Badge variant={l.idleDays >= 14 ? "destructive" : "outline"} className="shrink-0">{l.idleDays}d</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {l.stage} · {l.assignee?.full_name || l.assignee?.email || "Unassigned"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
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
