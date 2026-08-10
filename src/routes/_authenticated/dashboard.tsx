import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, ClipboardList, Users, Bell, ArrowRight } from "lucide-react";
import { format } from "date-fns";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "MMM d, p");
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, isStaff, companyId, company, ready } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, isStaff, companyId],
    enabled: ready,
    queryFn: async () => {
      if (!user) return { recent: [], todayCount: 0, upcoming: [], openTime: null };
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const next7 = new Date(); next7.setDate(next7.getDate() + 7);

      const visitsQ = supabase
        .from("customer_visits")
        .select("id, customer_name, company, meeting_at, next_meeting_at, next_action, user_id", { count: "exact" })
        .order("meeting_at", { ascending: false })
        .limit(5);
      if (companyId) visitsQ.eq("company_id", companyId);
      if (!isStaff) visitsQ.eq("user_id", user.id);
      const { data: recent } = await visitsQ;

      const todayQ = supabase
        .from("customer_visits")
        .select("id", { count: "exact", head: true })
        .gte("meeting_at", todayStart.toISOString());
      if (companyId) todayQ.eq("company_id", companyId);
      if (!isStaff) todayQ.eq("user_id", user.id);
      const { count: todayCount } = await todayQ;

      const upcomingQ = supabase
        .from("customer_visits")
        .select("id, customer_name, company, next_meeting_at, next_action")
        .gte("next_meeting_at", new Date().toISOString())
        .lte("next_meeting_at", next7.toISOString())
        .order("next_meeting_at", { ascending: true })
        .limit(5);
      if (companyId) upcomingQ.eq("company_id", companyId);
      if (!isStaff) upcomingQ.eq("user_id", user.id);
      const { data: upcoming } = await upcomingQ;

      const { data: openTime } = await supabase
        .from("time_entries")
        .select("id, check_in")
        .eq("user_id", user.id)
        .is("check_out", null)
        .maybeSingle();

      return { recent: recent ?? [], todayCount: todayCount ?? 0, upcoming: upcoming ?? [], openTime };
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company ? `${company.name} — ` : ""}Welcome back. Here's what's happening today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/check-in"><Clock className="mr-2 h-4 w-4" />Time clock</Link></Button>
          <Button asChild><Link to="/visits/new"><ClipboardList className="mr-2 h-4 w-4" />New visit</Link></Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Visits today" value={stats?.todayCount ?? 0} icon={ClipboardList} />
        <StatCard label="Upcoming (7d)" value={stats?.upcoming.length ?? 0} icon={Bell} />
        <StatCard
          label="Time clock"
          value={stats?.openTime ? "Active" : "Off"}
          icon={Clock}
          tone={stats?.openTime ? "success" : "muted"}
        />
        <StatCard label="Scope" value={isStaff ? "Team" : "You"} icon={Users} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Recent visits</h2>
            <Link to="/visits" className="text-sm text-primary hover:underline">View all <ArrowRight className="inline h-3 w-3" /></Link>
          </div>
          <div className="space-y-3">
            {stats?.recent.length === 0 && <p className="text-sm text-muted-foreground">No visits yet.</p>}
            {stats?.recent.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="font-medium">{v.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{v.company || "—"} · {formatDateTime(v.meeting_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Upcoming follow-ups</h2>
          <div className="space-y-3">
            {stats?.upcoming.length === 0 && <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>}
            {stats?.upcoming.map((v) => (
              <div key={v.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{v.customer_name}</div>
                  <Badge variant="secondary">{formatDateTime(v.next_meeting_at)}</Badge>
                </div>
                {v.next_action && <div className="mt-1 text-xs text-muted-foreground">{v.next_action}</div>}
              </div>
            ))}
          </div>
        </Card>

        <RenewalAlertsCard />
      </div>

    </div>
  );
}

function StatCard({
  label, value, icon: Icon, tone = "default",
}: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tone?: "default" | "success" | "muted" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <Icon className={`h-4 w-4 ${tone === "success" ? "text-success" : "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Card>
  );
}
