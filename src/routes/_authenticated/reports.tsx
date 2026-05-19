import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart3, Download, TrendingUp, TrendingDown, Users, Building2, Handshake } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Visit = {
  id: string;
  user_id: string;
  customer_name: string | null;
  company: string | null;
  contact_type: string | null;
  meeting_at: string;
  location: string | null;
};

type Profile = { id: string; full_name: string | null; email: string | null };

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
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
    queryKey: ["reports", user?.id, isStaff, companyId, from, to],
    enabled: !!user,
    queryFn: async () => {
      const fromIso = startOfDay(new Date(from)).toISOString();
      const toIso = new Date(`${to}T23:59:59`).toISOString();
      const vq = supabase
        .from("customer_visits")
        .select("id,user_id,customer_name,company,contact_type,meeting_at,location")
        .gte("meeting_at", fromIso)
        .lte("meeting_at", toIso)
        .order("meeting_at", { ascending: false });
      if (companyId) vq.eq("company_id", companyId);
      if (!isStaff) vq.eq("user_id", user!.id);
      const { data: visits, error } = await vq;
      if (error) throw error;
      const v = (visits ?? []) as Visit[];

      const ids = Array.from(new Set(v.map((x) => x.user_id)));
      let profiles: Profile[] = [];
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", ids);
        profiles = (ps ?? []) as Profile[];
      }
      const pMap = new Map(profiles.map((p) => [p.id, p]));
      return { visits: v, profiles: pMap };
    },
  });

  const visits = data?.visits ?? [];
  const pMap = data?.profiles ?? new Map<string, Profile>();

  const byEmployee = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits) m.set(v.user_id, (m.get(v.user_id) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([uid, count]) => ({
        userId: uid,
        name: pMap.get(uid)?.full_name ?? pMap.get(uid)?.email ?? "Unknown",
        email: pMap.get(uid)?.email ?? "",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [visits, pMap]);

  const byContactType = useMemo(() => {
    const groups: Record<string, Map<string, number>> = {};
    for (const v of visits) {
      const t = v.contact_type || "customer";
      const key = (v.company || v.customer_name || "Unknown").trim();
      if (!groups[t]) groups[t] = new Map();
      groups[t].set(key, (groups[t].get(key) ?? 0) + 1);
    }
    const toList = (t: string) =>
      Array.from((groups[t] ?? new Map()).entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    return {
      customers: toList("customer"),
      partners: toList("partner"),
      consultants: toList("consultant"),
    };
  }, [visits]);

  const totals = {
    visits: visits.length,
    employees: byEmployee.length,
    customers: byContactType.customers.length,
    partners: byContactType.partners.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Visit analytics across employees, customers and partners.
          </p>
        </div>
      </div>

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
          <div className="flex items-end">
            <div className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `${totals.visits} visits in range`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Total Visits" value={totals.visits} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Active Employees" value={totals.employees} />
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Customers Visited" value={totals.customers} />
        <StatCard icon={<Handshake className="h-4 w-4" />} label="Partners Visited" value={totals.partners} />
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="employees">Employee-wise</TabsTrigger>
          <TabsTrigger value="top-employees">Top Employees</TabsTrigger>
          <TabsTrigger value="least-employees">Least Active</TabsTrigger>
          <TabsTrigger value="top-customers">Top Customers</TabsTrigger>
          <TabsTrigger value="top-partners">Top Partners</TabsTrigger>
          <TabsTrigger value="top-consultants">Top Consultants</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <RankTable
            title="Employee-wise Visit Report"
            description="Number of visits made by each employee in the selected range."
            rows={byEmployee.map((e) => ({ label: e.name, sub: e.email, count: e.count }))}
            filename="employee-wise-visits.csv"
            columnLabel="Employee"
          />
        </TabsContent>

        <TabsContent value="top-employees">
          <RankTable
            title="Top Employees by Visit Count"
            description="Highest performing employees by number of visits logged."
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            rows={byEmployee.slice(0, 10).map((e) => ({ label: e.name, sub: e.email, count: e.count }))}
            filename="top-employees.csv"
            columnLabel="Employee"
          />
        </TabsContent>

        <TabsContent value="least-employees">
          <RankTable
            title="Employees with Least Visits"
            description="Employees with the fewest logged visits in the selected range."
            icon={<TrendingDown className="h-4 w-4 text-destructive" />}
            rows={[...byEmployee].reverse().slice(0, 10).map((e) => ({ label: e.name, sub: e.email, count: e.count }))}
            filename="least-active-employees.csv"
            columnLabel="Employee"
          />
        </TabsContent>

        <TabsContent value="top-customers">
          <RankTable
            title="Top Visited Customers"
            description="Customers ranked by number of visits."
            rows={byContactType.customers.slice(0, 20).map((c) => ({ label: c.name, count: c.count }))}
            filename="top-customers.csv"
            columnLabel="Customer"
          />
        </TabsContent>

        <TabsContent value="top-partners">
          <RankTable
            title="Top Visited Partners"
            description="Partners ranked by number of visits."
            rows={byContactType.partners.slice(0, 20).map((c) => ({ label: c.name, count: c.count }))}
            filename="top-partners.csv"
            columnLabel="Partner"
          />
        </TabsContent>

        <TabsContent value="top-consultants">
          <RankTable
            title="Top Visited Consultants"
            description="Consultants ranked by number of visits."
            rows={byContactType.consultants.slice(0, 20).map((c) => ({ label: c.name, count: c.count }))}
            filename="top-consultants.csv"
            columnLabel="Consultant"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RankTable({
  title, description, rows, filename, columnLabel, icon,
}: {
  title: string;
  description?: string;
  rows: { label: string; sub?: string; count: number }[];
  filename: string;
  columnLabel: string;
  icon?: React.ReactNode;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="mt-3">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() =>
            downloadCSV(filename, [
              [columnLabel, "Visits", "% of total"],
              ...rows.map((r) => [r.label + (r.sub ? ` (${r.sub})` : ""), r.count, total ? ((r.count / total) * 100).toFixed(1) + "%" : "0%"]),
            ])
          }
        >
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data in selected range.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{columnLabel}</TableHead>
                <TableHead className="w-48">Visits</TableHead>
                <TableHead className="w-20 text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.label}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.label}</div>
                    {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="h-2 w-full overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(r.count / max) * 100}%` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">{r.count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
