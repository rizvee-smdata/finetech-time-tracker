import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { formatBDT } from "@/lib/manager/helpers";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  component: ManagerReportsPage,
});

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function ManagerReportsPage() {
  const { companyId } = useAuth();
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const data = useQuery({
    queryKey: ["mgr-reports", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const [exp, visits, pipeline, members] = await Promise.all([
        supabase.from("expenses")
          .select("user_id, category_name, amount, status")
          .eq("company_id", companyId!)
          .gte("expense_date", from).lte("expense_date", to),
        supabase.from("customer_visits")
          .select("user_id, customer_name, meeting_at")
          .eq("company_id", companyId!)
          .gte("meeting_at", `${from}T00:00:00`)
          .lte("meeting_at", `${to}T23:59:59`),
        supabase.from("crm_leads")
          .select("assigned_to, expected_value, stage")
          .eq("company_id", companyId!),
        supabase.from("company_members")
          .select("user_id, profiles:user_id(full_name)")
          .eq("company_id", companyId!),
      ]);
      return {
        expenses: exp.data ?? [],
        visits: visits.data ?? [],
        pipeline: pipeline.data ?? [],
        members: members.data ?? [],
      };
    },
  });

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    (data.data?.expenses ?? []).forEach((e: any) => {
      m.set(e.category_name, (m.get(e.category_name) ?? 0) + Number(e.amount));
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [data.data]);

  const byClient = useMemo(() => {
    const m = new Map<string, number>();
    (data.data?.visits ?? []).forEach((v: any) => {
      m.set(v.customer_name, (m.get(v.customer_name) ?? 0) + 1);
    });
    return Array.from(m, ([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);
  }, [data.data]);

  const repPerf = useMemo(() => {
    const nameMap = new Map<string, string>();
    (data.data?.members ?? []).forEach((m: any) => nameMap.set(m.user_id, m.profiles?.full_name ?? "Rep"));
    const map = new Map<string, { visits: number; expenses: number; pipeline: number; won: number }>();
    (data.data?.visits ?? []).forEach((v: any) => {
      const r = map.get(v.user_id) ?? { visits: 0, expenses: 0, pipeline: 0, won: 0 };
      r.visits += 1; map.set(v.user_id, r);
    });
    (data.data?.expenses ?? []).forEach((e: any) => {
      const r = map.get(e.user_id) ?? { visits: 0, expenses: 0, pipeline: 0, won: 0 };
      r.expenses += Number(e.amount); map.set(e.user_id, r);
    });
    (data.data?.pipeline ?? []).forEach((p: any) => {
      if (!p.assigned_to) return;
      const r = map.get(p.assigned_to) ?? { visits: 0, expenses: 0, pipeline: 0, won: 0 };
      if (p.stage === "won") r.won += Number(p.expected_value ?? 0);
      else if (!["lost"].includes(p.stage)) r.pipeline += Number(p.expected_value ?? 0);
      map.set(p.assigned_to, r);
    });
    return Array.from(map, ([user_id, v]) => ({
      name: nameMap.get(user_id) ?? "Rep", ...v,
    })).sort((a, b) => b.pipeline + b.won - (a.pipeline + a.won));
  }, [data.data]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(byCategory.map(c => ({ Category: c.name, Total_BDT: c.value }))),
      "Expenses by Category");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(byClient.map(c => ({ Client: c.name, Visits: c.count }))),
      "Visits by Client");
    XLSX.utils.book_append_sheet(wb,
      XLSX.utils.json_to_sheet(repPerf.map(r => ({
        Rep: r.name, Visits: r.visits, Expenses_BDT: r.expenses, Open_Pipeline_BDT: r.pipeline, Won_BDT: r.won,
      }))),
      "Rep Performance");
    XLSX.writeFile(wb, `manager-report-${from}-to-${to}.xlsx`);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
          <Button onClick={exportExcel} disabled={data.isLoading}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Expenses by Category</h2>
          {data.isLoading ? <Skeleton className="h-72 w-full" /> : byCategory.length === 0 ? (
            <div className="grid h-72 place-items-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={100} label={(d) => d.name}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatBDT(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Top Clients by Visit Frequency</h2>
          {data.isLoading ? <Skeleton className="h-72 w-full" /> : byClient.length === 0 ? (
            <div className="grid h-72 place-items-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byClient} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Rep Performance Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Rep</th>
                <th className="px-3 py-2 text-right">Visits</th>
                <th className="px-3 py-2 text-right">Expenses</th>
                <th className="px-3 py-2 text-right">Open Pipeline</th>
                <th className="px-3 py-2 text-right">Won</th>
              </tr>
            </thead>
            <tbody>
              {data.isLoading ? (
                <tr><td colSpan={5}><Skeleton className="h-20 w-full" /></td></tr>
              ) : repPerf.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No data</td></tr>
              ) : repPerf.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.visits}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBDT(r.expenses)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBDT(r.pipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-600">{formatBDT(r.won)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
