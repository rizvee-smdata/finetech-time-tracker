import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Receipt, Send, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { STATUS_COLORS, formatUSD, type Expense, type ExpenseStatus } from "@/lib/expenses/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/expenses/")({
  component: MyExpensesPage,
});

const FILTERS: { value: ExpenseStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function MyExpensesPage() {
  const { user, companyId } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<ExpenseStatus | "all">("all");

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", "mine", user?.id, companyId, filter],
    enabled: !!user && !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .order("expense_date", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  async function submitExpense(e: Expense) {
    const { error } = await supabase
      .from("expenses")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", e.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Submitted for approval");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this draft expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    }
  }

  const totals = (expenses ?? []).reduce(
    (acc, e) => {
      acc.count += 1;
      acc.total += Number(e.amount);
      if (e.status === "approved") acc.approved += Number(e.amount);
      if (e.status === "submitted") acc.pending += Number(e.amount);
      return acc;
    },
    { count: 0, total: 0, approved: 0, pending: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button asChild size="sm">
          <Link to="/expenses/new"><Plus className="mr-1.5 h-4 w-4" /> New expense</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-semibold">{formatUSD(totals.total)}</div>
          <div className="text-xs text-muted-foreground">{totals.count} item(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending approval</div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{formatUSD(totals.pending)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Approved</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatUSD(totals.approved)}</div>
        </Card>
      </div>

      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && (expenses ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No expenses yet. Tap "New expense" to add your first.
          </div>
        )}
        {(expenses ?? []).map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.category_name}</span>
                <Badge className={STATUS_COLORS[e.status]} variant="secondary">{e.status}</Badge>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {format(new Date(e.expense_date), "PP")}
                {e.description ? ` · ${e.description}` : ""}
              </div>
              {e.reviewer_comment && (
                <div className="mt-1 truncate text-xs text-amber-600 dark:text-amber-400">
                  Reviewer: {e.reviewer_comment}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{formatUSD(Number(e.amount))}</div>
            </div>
            <div className="flex gap-1">
              {(e.status === "draft" || e.status === "rejected") && (
                <>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/expenses/$expenseId" params={{ expenseId: e.id }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => submitExpense(e)}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Submit
                  </Button>
                </>
              )}
              {e.status === "draft" && (
                <Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
