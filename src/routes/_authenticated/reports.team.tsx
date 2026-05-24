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
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/team")({
  component: TeamScorecard,
});

type Profile = { id: string; full_name: string | null; email: string | null };

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TeamScorecard() {
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
    queryKey: ["reports-team", user?.id, isStaff, companyId, from, to],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      const fromIso = startOfDay(new Date(from)).toISOString();
      const toIso = new Date(`${to}T23:59:59`).toISOString();

      const [members, visits, leads, tasks, attendance, expenses] = await Promise.all([
        supabase.from("company_members").select("user_id").eq("company_id", companyId!),
        supabase
          .from("customer_visits")
          .select("user_id")
          .eq("company_id", companyId!)
          .gte("meeting_at", fromIso)
          .lte("meeting_at", toIso),
        supabase
          .from("crm_leads")
          .select("assigned_to,stage,expected_value")
          .eq("company_id", companyId!)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("tms_tasks")
          .select("created_by,completed_at")
          .eq("company_id", companyId!)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("attendance_records")
          .select("user_id,total_minutes")
          .eq("company_id", companyId!)
          .gte("work_date", from)
          .lte("work_date", to),
        supabase
          .from("expenses")
          .select("user_id,amount,status")
          .eq("company_id", companyId!)
          .gte("expense_date", from)
          .lte("expense_date", to),
      ]);

      const memberIds = ((members.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
      const profilesQ = memberIds.length
        ? await supabase.from("profiles").select("id,full_name,email").in("id", memberIds)
        : { data: [] as Profile[] };
      const profiles = new Map(((profilesQ.data ?? []) as Profile[]).map((p) => [p.id, p]));

      return {
        memberIds,
        profiles,
        visits: (visits.data ?? []) as Array<{ user_id: string }>,
        leads: (leads.data ?? []) as Array<{ assigned_to: string | null; stage: string; expected_value: number | null }>,
        tasks: (tasks.data ?? []) as Array<{ created_by: string; completed_at: string | null }>,
        attendance: ((attendance.data ?? []) as unknown) as Array<{ user_id: string; total_minutes: number | null }>,
        expenses: (expenses.data ?? []) as Array<{ user_id: string; amount: number; status: string }>,
      };
    },
  });

  const scoreboard = useMemo(() => {
    if (!data) return [] as Array<{
      userId: string; name: string; email: string;
      visits: number; leadsCreated: number; leadsWon: number; wonValue: number;
      tasksDone: number; attendanceDays: number; expenses: number;
    }>;
    return data.memberIds.map((uid) => {
      const visits = data.visits.filter((v) => v.user_id === uid).length;
      const leads = data.leads.filter((l) => l.assigned_to === uid);
      const won = leads.filter((l) => l.stage === "won");
      const tasks = data.tasks.filter((t) => t.created_by === uid);
      const tasksDone = tasks.filter((t) => t.completed_at).length;
      const att = data.attendance.filter((a) => a.user_id === uid);
      const exp = data.expenses
        .filter((e) => e.user_id === uid && (e.status === "approved" || e.status === "reimbursed"))
        .reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const p = data.profiles.get(uid);
      return {
        userId: uid,
        name: p?.full_name ?? p?.email ?? "Unknown",
        email: p?.email ?? "",
        visits,
        leadsCreated: leads.length,
        leadsWon: won.length,
        wonValue: won.reduce((s, l) => s + Number(l.expected_value ?? 0), 0),
        tasksDone,
        attendanceDays: att.length,
        expenses: exp,
      };
    }).sort((a, b) => b.wonValue - a.wonValue || b.visits - a.visits);
  }, [data]);

  const bdt = (n: number) => `৳ ${n.toLocaleString()}`;

  if (!isStaff) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Team scorecard is available to managers and admins only.
        </CardContent>
      </Card>
    );
  }

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
            {isLoading ? "Loading…" : `${scoreboard.length} team members`}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Team scorecard</CardTitle>
            <CardDescription>Combined view of activity, sales and time per team member.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!scoreboard.length}
            onClick={() => downloadCSV("team-scorecard.csv", [
              ["Name", "Email", "Visits", "Leads", "Won", "Won Value", "Tasks Done", "Attendance Days", "Approved Expenses"],
              ...scoreboard.map((r) => [r.name, r.email, r.visits, r.leadsCreated, r.leadsWon, r.wonValue, r.tasksDone, r.attendanceDays, r.expenses]),
            ])}
          >
            <Download className="mr-1.5 h-4 w-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {scoreboard.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No team members in this company.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Team member</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Won value</TableHead>
                  <TableHead className="text-right">Tasks ✓</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoreboard.map((r, i) => (
                  <TableRow key={r.userId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      {r.email && <div className="text-xs text-muted-foreground">{r.email}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.leadsCreated}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.leadsWon > 0 ? <Badge variant="secondary">{r.leadsWon}</Badge> : r.leadsWon}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{bdt(r.wonValue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.tasksDone}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.attendanceDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{bdt(r.expenses)}</TableCell>
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
