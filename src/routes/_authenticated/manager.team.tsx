import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT, initialsOf } from "@/lib/manager/helpers";

export const Route = createFileRoute("/_authenticated/manager/team")({
  component: TeamOverviewPage,
});

type RepRow = {
  user_id: string;
  full_name: string;
  status: "Active Field" | "Office" | "Leave" | "No Activity";
  checkins: number;
  expenses: number;
  tasks: number;
  pipelineValue: number;
};

function TeamOverviewPage() {
  const { companyId } = useAuth();

  const data = useQuery({
    queryKey: ["mgr-team-overview", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const today = startOfDay.slice(0, 10);

      const [members, checkinsToday, expensesToday, tasksToday, pipeline, leaves] = await Promise.all([
        supabase.from("company_members")
          .select("user_id, profiles:user_id(full_name)")
          .eq("company_id", companyId!),
        supabase.from("visit_checkins")
          .select("user_id")
          .eq("company_id", companyId!).gte("checked_in_at", startOfDay),
        supabase.from("expenses")
          .select("user_id")
          .eq("company_id", companyId!).eq("expense_date", today),
        supabase.from("tms_tasks")
          .select("created_by, tms_task_statuses(is_terminal)")
          .eq("company_id", companyId!).eq("scheduled_date", today),
        supabase.from("crm_leads")
          .select("assigned_to, expected_value")
          .eq("company_id", companyId!)
          .in("stage", ["new", "initial_contact", "pricing", "negotiation", "closure"]),
        supabase.from("attendance_records")
          .select("user_id, status")
          .eq("company_id", companyId!).eq("work_date", today),
      ]);

      const checkinCount = new Map<string, number>();
      (checkinsToday.data ?? []).forEach((r: any) => {
        checkinCount.set(r.user_id, (checkinCount.get(r.user_id) ?? 0) + 1);
      });
      const expenseCount = new Map<string, number>();
      (expensesToday.data ?? []).forEach((r: any) => {
        expenseCount.set(r.user_id, (expenseCount.get(r.user_id) ?? 0) + 1);
      });
      const taskCount = new Map<string, number>();
      (tasksToday.data ?? []).forEach((r: any) => {
        if (r.tms_task_statuses?.is_terminal) {
          taskCount.set(r.created_by, (taskCount.get(r.created_by) ?? 0) + 1);
        }
      });
      const pipelineMap = new Map<string, number>();
      (pipeline.data ?? []).forEach((r: any) => {
        if (!r.assigned_to) return;
        pipelineMap.set(r.assigned_to, (pipelineMap.get(r.assigned_to) ?? 0) + Number(r.expected_value ?? 0));
      });
      const leaveMap = new Map<string, string>();
      (leaves.data ?? []).forEach((r: any) => leaveMap.set(r.user_id, r.status));

      const rows: RepRow[] = (members.data ?? []).map((m: any) => {
        const checkins = checkinCount.get(m.user_id) ?? 0;
        const leaveStatus = leaveMap.get(m.user_id);
        let status: RepRow["status"] = "No Activity";
        if (leaveStatus && ["leave", "on_leave"].includes(leaveStatus)) status = "Leave";
        else if (checkins > 0) status = "Active Field";
        else if (leaveStatus === "present" || expenseCount.get(m.user_id)) status = "Office";
        return {
          user_id: m.user_id,
          full_name: m.profiles?.full_name ?? "Rep",
          status,
          checkins,
          expenses: expenseCount.get(m.user_id) ?? 0,
          tasks: taskCount.get(m.user_id) ?? 0,
          pipelineValue: pipelineMap.get(m.user_id) ?? 0,
        };
      });

      rows.sort((a, b) => b.pipelineValue - a.pipelineValue);
      return rows;
    },
  });

  const statusColor: Record<RepRow["status"], string> = {
    "Active Field": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    "Office": "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    "Leave": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    "No Activity": "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Team Overview</h1>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Rep</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Check-ins</th>
                <th className="px-4 py-3 text-right">Expenses</th>
                <th className="px-4 py-3 text-right">Tasks Done</th>
                <th className="px-4 py-3 text-right">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {data.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="p-2"><Skeleton className="h-10 w-full" /></td></tr>
                ))
              ) : (data.data ?? []).length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No team members</td></tr>
              ) : (
                data.data!.map((r) => (
                  <tr key={r.user_id} className="border-t border-border hover:bg-accent/50">
                    <td className="px-4 py-3">
                      <Link to="/team" className="flex items-center gap-2 hover:underline">
                        <Avatar className="h-8 w-8"><AvatarFallback>{initialsOf(r.full_name)}</AvatarFallback></Avatar>
                        <span className="font-medium">{r.full_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColor[r.status]} variant="outline">{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.checkins}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.expenses}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.tasks}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatBDT(r.pipelineValue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
