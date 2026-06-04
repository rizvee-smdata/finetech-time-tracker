import { createFileRoute, Link, Outlet, useRouter, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Receipt, ClipboardCheck, Users, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manager")({
  beforeLoad: () => {
    // gating done via component check; layout shared
  },
  component: ManagerLayout,
});

const tabs = [
  { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/approvals/expenses", label: "Expenses", icon: Receipt },
  { to: "/manager/approvals/visits", label: "Visit Reports", icon: ClipboardCheck },
  { to: "/manager/team", label: "Team", icon: Users },
  { to: "/manager/reports", label: "Reports", icon: BarChart3 },
];

function ManagerLayout() {
  const { isStaff, loading } = useAuth();
  const router = useRouter();
  const path = router.state.location.pathname;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!isStaff) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          You need manager or admin access to view this area.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
