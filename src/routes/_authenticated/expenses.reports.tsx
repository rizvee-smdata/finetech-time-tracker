import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { formatUSD, type Expense } from "@/lib/expenses/types";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

export const Route = createFileRoute("/_authenticated/expenses/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { user, companyId, isStaff } = useAuth();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [monthOffset, setMonthOffset] = useState(0);

  const monthDate = subMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const { data: expenses } = useQuery({
    queryKey: ["expenses-report", scope, companyId, monthStart.toISOString()],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*")
        .eq("company_id", companyId!)
        .gte("expense_date", monthStart.toISOString().slice(0, 10))
        .lte("expense_date", monthEnd.toISOString().slice(0, 10));
      if (scope === "mine") q = q.eq("user_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["expenses-report-profiles", expenses?.map((e) => e.user_id).join(",")],
    enabled: !!expenses && expenses.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(expenses!.map((e) => e.user_id)));
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return new Map((data ?? []).map((p) => [p.id, p]));
    },
  });

  const stats = useMemo(() => {
    const rows = expenses ?? [];
    let approved = 0, pending = 0, rejected = 0;
    const byCategory: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    for (const e of rows) {
      const a = Number(e.amount);
      if (e.status === "approved") approved += a;
      else if (e.status === "submitted") pending += a;
      else if (e.status === "rejected") rejected += a;
      if (e.status !== "rejected") {
        byCategory[e.category_name] = (byCategory[e.category_name] ?? 0) + a;
        byUser[e.user_id] = (byUser[e.user_id] ?? 0) + a;
      }
    }
    return { approved, pending, rejected, byCategory, byUser, count: rows.length };
  }, [expenses]);

  function exportCSV() {
    const rows = expenses ?? [];
    const header = ["Date", "User", "Category", "Amount USD", "Status", "Description"];
    const lines = [header.join(",")];
    for (const e of rows) {
      const userName = profiles?.get(e.user_id)?.full_name ?? e.user_id;
      lines.push([
        e.expense_date,
        `"${(userName ?? "").replace(/"/g, '""')}"`,
        `"${e.category_name.replace(/"/g, '""')}"`,
        Number(e.amount).toFixed(2),
        e.status,
        `"${(e.description ?? "").replace(/"/g, '""')}"`,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${format(monthStart, "yyyy-MM")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isStaff && (
            <Select value={scope} onValueChange={(v) => setScope(v as "mine" | "team")}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My expenses</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={String(monthOffset)} onValueChange={(v) => setMonthOffset(Number(v))}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i} value={String(i)}>{format(subMonths(new Date(), i), "MMMM yyyy")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}>
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Approved</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatUSD(stats.approved)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{formatUSD(stats.pending)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Rejected</div>
          <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatUSD(stats.rejected)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Items</div>
          <div className="text-lg font-semibold">{stats.count}</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">By category</h3>
          {Object.keys(stats.byCategory).length === 0 ? (
            <div className="text-sm text-muted-foreground">No data.</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
                const max = Math.max(...Object.values(stats.byCategory));
                const pct = max > 0 ? (amt / max) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs">
                      <span>{cat}</span>
                      <span className="tabular-nums font-medium">{formatUSD(amt)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {scope === "team" && (
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">By rep</h3>
            {Object.keys(stats.byUser).length === 0 ? (
              <div className="text-sm text-muted-foreground">No data.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.byUser).sort((a, b) => b[1] - a[1]).map(([uid, amt]) => {
                  const name = profiles?.get(uid)?.full_name ?? profiles?.get(uid)?.email ?? "Unknown";
                  const max = Math.max(...Object.values(stats.byUser));
                  const pct = max > 0 ? (amt / max) * 100 : 0;
                  return (
                    <div key={uid}>
                      <div className="flex justify-between text-xs">
                        <span>{name}</span>
                        <span className="tabular-nums font-medium">{formatUSD(amt)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
