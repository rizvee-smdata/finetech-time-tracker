import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsLayout,
});

const tabs = [
  { to: "/reports", label: "Overview", exact: true },
  { to: "/reports/sales", label: "Sales" },
  { to: "/reports/leads", label: "Leads" },
  { to: "/reports/visits", label: "Visits" },
  { to: "/reports/office-work", label: "Office work" },
  { to: "/reports/team", label: "Team scorecard" },
];

function ReportsLayout() {
  const router = useRouter();
  const path = router.state.location.pathname;
  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 className="h-6 w-6 text-primary" /> Reports & analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          Cross-module performance insights — sales, visits, attendance and team productivity.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const active = isActive(t.to, t.exact);
          return (
            <Link
              key={t.to}
              to={t.to as "/reports"}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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
