import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesLayout,
});

function ExpensesLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const { user, companyId, isStaff, isAdmin } = useAuth();

  const { data: isApprover } = useQuery({
    queryKey: ["is-expense-approver", user?.id, companyId],
    enabled: !!user && !!companyId && !isStaff,
    queryFn: async () => {
      const { count } = await supabase
        .from("expense_approver_assignments")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("approver_id", user!.id);
      return (count ?? 0) > 0;
    },
  });

  const canApprove = isAdmin || isStaff || !!isApprover;

  const tabs: { to: string; label: string }[] = [
    { to: "/expenses", label: "My expenses" },
    ...(canApprove ? [{ to: "/expenses/approvals", label: "Approvals" }] : []),
    { to: "/expenses/reports", label: "Reports" },
    ...(isAdmin || isStaff ? [{ to: "/expenses/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">Log, submit, and track field expenses.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {tabs.map((t) => {
          const active = path === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
