import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ExpenseForm from "@/components/expenses/ExpenseForm";
import type { Expense } from "@/lib/expenses/types";

export const Route = createFileRoute("/_authenticated/expenses/$expenseId")({
  component: EditExpensePage,
});

function EditExpensePage() {
  const { expenseId } = Route.useParams();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
      if (error) throw error;
      return data as Expense;
    },
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Not found.</div>;
  return <ExpenseForm initial={data} onDone={() => nav({ to: "/expenses" })} />;
}
