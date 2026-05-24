import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Receipt } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { STATUS_COLORS, formatUSD, type Expense } from "@/lib/expenses/types";

export const Route = createFileRoute("/_authenticated/expenses/approvals")({
  component: ApprovalsPage,
});

interface ExpenseRow extends Expense {
  user?: { full_name: string | null; email: string | null } | null;
}

function ApprovalsPage() {
  const { user, companyId, isStaff } = useAuth();
  const qc = useQueryClient();
  const [comments, setComments] = useState<Record<string, string>>({});

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", "approvals", companyId],
    enabled: !!user && !!companyId && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("company_id", companyId!)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Expense[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length === 0) return rows as ExpenseRow[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, user: byId.get(r.user_id) ?? null })) as ExpenseRow[];
    },
  });

  async function decide(e: ExpenseRow, status: "approved" | "rejected") {
    const comment = comments[e.id]?.trim() || null;
    if (status === "rejected" && !comment) return toast.error("Add a comment for rejection");
    const { error } = await supabase
      .from("expenses")
      .update({
        status,
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        reviewer_comment: comment,
      })
      .eq("id", e.id);
    if (error) return toast.error(error.message);

    await supabase.from("reminders").insert({
      user_id: e.user_id,
      company_id: e.company_id,
      title: `Expense ${status}: ${e.category_name}`,
      body: `${formatUSD(Number(e.amount))} on ${format(new Date(e.expense_date), "PP")}${comment ? ` — ${comment}` : ""}`,
      remind_at: new Date().toISOString(),
    });

    toast.success(status === "approved" ? "Approved" : "Rejected");
    qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  if (!isStaff) return <div className="text-sm text-muted-foreground">Only managers and admins can review expenses.</div>;

  return (
    <div className="space-y-3">
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && (expenses ?? []).length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No pending expense submissions.
        </Card>
      )}
      {(expenses ?? []).map((e) => (
        <Card key={e.id} className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{e.user?.full_name ?? e.user?.email ?? "Unknown"}</span>
                <Badge className={STATUS_COLORS[e.status]} variant="secondary">{e.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {e.category_name} · {format(new Date(e.expense_date), "PP")}
                {e.submitted_at ? ` · submitted ${format(new Date(e.submitted_at), "PP p")}` : ""}
              </div>
              {e.description && <div className="mt-1 text-sm">{e.description}</div>}
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{formatUSD(Number(e.amount))}</div>
            </div>
          </div>
          <Textarea
            rows={2}
            placeholder="Optional comment (required to reject)"
            value={comments[e.id] ?? ""}
            onChange={(ev) => setComments({ ...comments, [e.id]: ev.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => decide(e, "rejected")}>
              <X className="mr-1 h-4 w-4" /> Reject
            </Button>
            <Button size="sm" onClick={() => decide(e, "approved")}>
              <Check className="mr-1 h-4 w-4" /> Approve
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
