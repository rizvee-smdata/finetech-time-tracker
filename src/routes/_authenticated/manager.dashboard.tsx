import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT, slaInfo } from "@/lib/manager/helpers";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ClipboardCheck, Receipt, UserCheck, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager/dashboard")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { companyId } = useAuth();
  const qc = useQueryClient();

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const kpis = useQuery({
    queryKey: ["manager-kpis", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [pendingExp, pendingVis, activeReps, weekVisits, pendingExpAmt] = await Promise.all([
        supabase.from("expenses").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("status", "submitted"),
        supabase.from("visit_reports").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("status", "pending"),
        supabase.from("visit_checkins").select("user_id")
          .eq("company_id", companyId!).gte("checked_in_at", startOfDay),
        supabase.from("customer_visits").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!).gte("meeting_at", weekAgo),
        supabase.from("expenses").select("amount")
          .eq("company_id", companyId!).eq("status", "submitted"),
      ]);
      const reps = new Set((activeReps.data ?? []).map((r: any) => r.user_id));
      const totalPending = (pendingExpAmt.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.amount || 0), 0);
      return {
        pendingExpenses: pendingExp.count ?? 0,
        pendingVisits: pendingVis.count ?? 0,
        activeReps: reps.size,
        weekVisits: weekVisits.count ?? 0,
        pendingExpenseTotal: totalPending,
      };
    },
  });

  const activity = useQuery({
    queryKey: ["manager-activity", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [checkins, expenses, visits] = await Promise.all([
        supabase.from("visit_checkins")
          .select("id, checked_in_at, user_id, lead_id, crm_leads(customer_name), profiles:user_id(full_name)")
          .eq("company_id", companyId!).order("checked_in_at", { ascending: false }).limit(15),
        supabase.from("expenses")
          .select("id, submitted_at, amount, category_name, user_id, profiles:user_id(full_name)")
          .eq("company_id", companyId!).eq("status", "submitted")
          .order("submitted_at", { ascending: false, nullsFirst: false }).limit(15),
        supabase.from("visit_reports")
          .select("id, submitted_at, user_id, report_date, profiles:user_id(full_name)")
          .eq("company_id", companyId!).order("submitted_at", { ascending: false }).limit(15),
      ]);
      const items: Array<{ ts: string; type: string; text: string }> = [];
      (checkins.data ?? []).forEach((r: any) =>
        items.push({
          ts: r.checked_in_at,
          type: "checkin",
          text: `${r.profiles?.full_name ?? "Rep"} checked in${r.crm_leads?.customer_name ? ` at ${r.crm_leads.customer_name}` : ""}`,
        }));
      (expenses.data ?? []).forEach((r: any) =>
        items.push({
          ts: r.submitted_at ?? new Date().toISOString(),
          type: "expense",
          text: `${r.profiles?.full_name ?? "Rep"} submitted ${r.category_name} expense ${formatBDT(Number(r.amount))}`,
        }));
      (visits.data ?? []).forEach((r: any) =>
        items.push({
          ts: r.submitted_at,
          type: "visit",
          text: `${r.profiles?.full_name ?? "Rep"} submitted EOD report for ${r.report_date}`,
        }));
      return items.sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 25);
    },
  });

  const breaches = useQuery({
    queryKey: ["manager-sla-breaches", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [exp, vis] = await Promise.all([
        supabase.from("expenses")
          .select("id, amount, category_name, submitted_at, profiles:user_id(full_name)")
          .eq("company_id", companyId!).eq("status", "submitted")
          .lte("submitted_at", cutoff).order("submitted_at").limit(10),
        supabase.from("visit_reports")
          .select("id, report_date, submitted_at, profiles:user_id(full_name)")
          .eq("company_id", companyId!).eq("status", "pending")
          .lte("submitted_at", cutoff).order("submitted_at").limit(10),
      ]);
      return [
        ...(exp.data ?? []).map((r: any) => ({
          type: "expense" as const,
          id: r.id,
          text: `Expense ${formatBDT(Number(r.amount))} (${r.category_name}) from ${r.profiles?.full_name ?? "Rep"}`,
          ts: r.submitted_at,
        })),
        ...(vis.data ?? []).map((r: any) => ({
          type: "visit" as const,
          id: r.id,
          text: `Visit report ${r.report_date} from ${r.profiles?.full_name ?? "Rep"}`,
          ts: r.submitted_at,
        })),
      ];
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`manager-dash-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        qc.invalidateQueries({ queryKey: ["manager-kpis"] });
        qc.invalidateQueries({ queryKey: ["manager-activity"] });
        qc.invalidateQueries({ queryKey: ["manager-sla-breaches"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_reports" }, () => {
        qc.invalidateQueries({ queryKey: ["manager-kpis"] });
        qc.invalidateQueries({ queryKey: ["manager-activity"] });
        qc.invalidateQueries({ queryKey: ["manager-sla-breaches"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visit_checkins" }, () => {
        qc.invalidateQueries({ queryKey: ["manager-kpis"] });
        qc.invalidateQueries({ queryKey: ["manager-activity"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [companyId, qc]);

  const cards = [
    {
      label: "Pending Approvals",
      value: (kpis.data?.pendingExpenses ?? 0) + (kpis.data?.pendingVisits ?? 0),
      icon: ClipboardCheck,
      to: "/manager/approvals/expenses",
      tone: "primary" as const,
    },
    {
      label: "Active in Field Today",
      value: kpis.data?.activeReps ?? 0,
      icon: UserCheck,
      to: "/manager/team",
      tone: "default" as const,
    },
    {
      label: "Visits This Week",
      value: kpis.data?.weekVisits ?? 0,
      icon: Activity,
      to: "/manager/reports",
      tone: "default" as const,
    },
    {
      label: "Pending Expenses",
      value: formatBDT(kpis.data?.pendingExpenseTotal ?? 0),
      icon: Receipt,
      to: "/manager/approvals/expenses",
      tone: "warning" as const,
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Manager Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className="block">
              <Card className="h-full p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{c.label}</div>
                    <div className="mt-2 text-2xl font-bold">
                      {kpis.isLoading ? <Skeleton className="h-7 w-16" /> : c.value}
                    </div>
                  </div>
                  <div className={`rounded-md p-2 ${
                    c.tone === "primary" ? "bg-primary/10 text-primary"
                    : c.tone === "warning" ? "bg-amber-500/10 text-amber-600"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Live Activity</h2>
            <Badge variant="outline" className="gap-1">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Realtime
            </Badge>
          </div>
          {activity.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No recent activity</div>
          ) : (
            <ul className="space-y-2">
              {activity.data!.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <span>{a.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.ts), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="font-semibold">SLA Breaches (&gt;24h)</h2>
          </div>
          {breaches.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (breaches.data ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">All clear</div>
          ) : (
            <ul className="space-y-2">
              {breaches.data!.map((b) => (
                <li key={`${b.type}-${b.id}`} className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
                  <div className="font-medium">{b.text}</div>
                  <div className="text-xs text-destructive">{slaInfo(b.ts).label}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <HealthAlertFeed />
    </div>
  );
}

