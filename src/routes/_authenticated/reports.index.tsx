import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Receipt,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsOverview,
});

function ReportsOverview() {
  const { user, isStaff, companyId } = useAuth();
  const [days, setDays] = useState("30");
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
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
    queryKey: ["reports-overview", user?.id, isStaff, companyId, from, to],
    enabled: !!user,
    queryFn: async () => {
      const fromIso = startOfDay(new Date(from)).toISOString();
      const toIso = new Date(`${to}T23:59:59`).toISOString();

      const scope = <T extends { eq: (k: string, v: string) => T }>(q: T, ownerKey = "user_id") => {
        if (companyId) q.eq("company_id", companyId);
        if (!isStaff && user) q.eq(ownerKey, user.id);
        return q;
      };

      const [visits, leads, expenses, attendance, tasks] = await Promise.all([
        scope(
          supabase
            .from("customer_visits")
            .select("id,user_id,meeting_at", { count: "exact", head: true })
            .gte("meeting_at", fromIso)
            .lte("meeting_at", toIso),
        ),
        (() => {
          const q = supabase
            .from("crm_leads")
            .select("id,stage,expected_value,currency,won_at,created_at,assigned_to,company_id")
            .gte("created_at", fromIso)
            .lte("created_at", toIso);
          if (companyId) q.eq("company_id", companyId);
          if (!isStaff && user) q.eq("assigned_to", user.id);
          return q;
        })(),
        (() => {
          const q = supabase
            .from("expenses")
            .select("id,amount,status,user_id,company_id,expense_date")
            .gte("expense_date", from)
            .lte("expense_date", to);
          if (companyId) q.eq("company_id", companyId);
          if (!isStaff && user) q.eq("user_id", user.id);
          return q;
        })(),
        scope(
          supabase
            .from("attendance_logs")
            .select("id,total_minutes,user_id", { count: "exact" })
            .gte("check_in_at", fromIso)
            .lte("check_in_at", toIso),
        ),
        (() => {
          const q = supabase
            .from("tms_tasks")
            .select("id,completed_at,company_id,created_by")
            .gte("created_at", fromIso)
            .lte("created_at", toIso);
          if (companyId) q.eq("company_id", companyId);
          if (!isStaff && user) q.eq("created_by", user.id);
          return q;
        })(),
      ]);

      const leadRows = (leads.data ?? []) as Array<{
        stage: string;
        expected_value: number | null;
        won_at: string | null;
      }>;
      const won = leadRows.filter((l) => l.stage === "won");
      const lost = leadRows.filter((l) => l.stage === "lost");
      const open = leadRows.filter((l) => !["won", "lost"].includes(l.stage));
      const wonValue = won.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
      const pipelineValue = open.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
      const decided = won.length + lost.length;
      const winRate = decided ? Math.round((won.length / decided) * 100) : 0;

      const expRows = (expenses.data ?? []) as Array<{ amount: number; status: string }>;
      const expApproved = expRows
        .filter((e) => e.status === "approved" || e.status === "reimbursed")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const expPending = expRows
        .filter((e) => e.status === "submitted")
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);

      const taskRows = (tasks.data ?? []) as Array<{ completed_at: string | null }>;
      const taskDone = taskRows.filter((t) => t.completed_at).length;

      const attRows = (attendance.data ?? []) as Array<{ total_minutes: number | null }>;
      const totalMinutes = attRows.reduce((s, r) => s + (r.total_minutes ?? 0), 0);

      return {
        visits: visits.count ?? 0,
        leadsCreated: leadRows.length,
        leadsWon: won.length,
        winRate,
        wonValue,
        pipelineValue,
        expApproved,
        expPending,
        attendanceDays: attRows.length,
        attendanceHours: Math.round(totalMinutes / 60),
        tasksCreated: taskRows.length,
        tasksDone: taskDone,
      };
    },
  });

  const fmt = (n: number) => n.toLocaleString();
  const bdt = (n: number) => `৳ ${n.toLocaleString()}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Range</Label>
            <Select value={days} onValueChange={onDaysChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
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
            {isLoading ? "Loading…" : `Showing ${from} → ${to}`}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Visits logged" value={fmt(data?.visits ?? 0)} />
        <Kpi icon={<Target className="h-4 w-4" />} label="Leads created" value={fmt(data?.leadsCreated ?? 0)} />
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label="Win rate"
          value={`${data?.winRate ?? 0}%`}
          sub={`${fmt(data?.leadsWon ?? 0)} won`}
        />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="Won value" value={bdt(data?.wonValue ?? 0)} />
        <Kpi icon={<Briefcase className="h-4 w-4" />} label="Open pipeline" value={bdt(data?.pipelineValue ?? 0)} />
        <Kpi
          icon={<Receipt className="h-4 w-4" />}
          label="Expenses approved"
          value={bdt(data?.expApproved ?? 0)}
          sub={`${bdt(data?.expPending ?? 0)} pending`}
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Tasks completed"
          value={`${fmt(data?.tasksDone ?? 0)} / ${fmt(data?.tasksCreated ?? 0)}`}
        />
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Attendance"
          value={`${fmt(data?.attendanceDays ?? 0)} days`}
          sub={`${fmt(data?.attendanceHours ?? 0)} hrs`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <DrillCard
          to="/reports/sales"
          title="Sales performance"
          description="Win rate, pipeline funnel and deal velocity from CRM leads."
        />
        <DrillCard
          to="/reports/visits"
          title="Visit analytics"
          description="Employee, customer and partner visit breakdowns with exports."
        />
        <DrillCard
          to="/reports/team"
          title="Team scorecard"
          description="Per-employee combined view: visits, deals, tasks and attendance."
        />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function DrillCard({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link to={to as "/reports"} className="block">
      <Card className="h-full transition-colors hover:border-primary">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">Open report →</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}
