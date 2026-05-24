import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracts")({
  component: ContractsLayout,
});

function ContractsLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const tabs = [
    { to: "/contracts", label: "All contracts" },
    { to: "/contracts/payments", label: "Payment dashboard" },
    { to: "/contracts/new", label: "New contract" },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contracts &amp; Payments</h1>
        <p className="text-sm text-muted-foreground">Track signed deals, payment milestones and renewals.</p>
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
